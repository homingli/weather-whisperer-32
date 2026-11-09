// Tests for the district-scale nowcast crop fetcher (nowcastLocal.ts):
// wet-crop parsing, the valid all-dry outcome (grid null), coverage-header
// epoch conversion, query-key quantization, and the throw-on-HTTP-error
// contract the silent fallback relies on.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchLocalRainNowcast, localNowcastQueryKey } from './nowcastLocal';
import { sampleRainGridAt } from './rainfallGrid';

const HEADER = 'UpdateTime,EndTime,Latitude,Longitude,Value_mm';

function row(lat: number, lon: number, value: number, endTime = '202609171630'): string {
  return `202609171600,${endTime},${lat.toFixed(3)},${lon.toFixed(3)},${value.toFixed(2)}`;
}

function csvResponse(lines: string[], coverage?: string): Response {
  const headers: Record<string, string> = { 'Content-Type': 'text/csv' };
  if (coverage) headers['X-Nowcast-Coverage-Until'] = coverage;
  return new Response([HEADER, ...lines].join('\n'), { status: 200, headers });
}

describe('localNowcastQueryKey', () => {
  it('quantizes coordinates to cell-center precision so the auto-load hook and the banner share one entry', () => {
    expect(localNowcastQueryKey(22.3, 114.2)).toEqual(['hkoLocalRainNowcast', 22300, 114200]);
    expect(localNowcastQueryKey(22.30004, 114.19996)).toEqual(['hkoLocalRainNowcast', 22300, 114200]);
    expect(localNowcastQueryKey(22.31, 114.2)).toEqual(['hkoLocalRainNowcast', 22310, 114200]);
  });
});

describe('fetchLocalRainNowcast', () => {
  const fetchMock = vi.fn();
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = realFetch;
  });

  it('parses a wet crop into a grid sampleable at the requested point', async () => {
    fetchMock.mockResolvedValueOnce(csvResponse(
      [row(22.3, 114.2, 1.5), row(22.318, 114.2195, 2.0)],
      '202609171700',
    ));

    const result = await fetchLocalRainNowcast(22.3, 114.2);

    // GPS-grade coords must be sent quantized to 3 decimals so every fix
    // near a point shares one CDN cache key.
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/nowcast?lat=22.300&lon=114.200'),
      expect.anything(),
    );
    expect(result.updateTime).toBe('2026-09-17 16:00');
    expect(result.coverageEndRaw).toBe('202609171700');
    // 17:00 HKT = 09:00 UTC (fixed UTC+8, no DST).
    expect(result.coverageEndMs).toBe(Date.UTC(2026, 8, 17, 9, 0));
    expect(result.fetchedAt).toBeGreaterThan(0);
    expect(result.grid).not.toBeNull();
    const sampled = sampleRainGridAt(result.grid!, 22.3, 114.2)!;
    expect(sampled).toHaveLength(1); // one step in the crop
    expect(sampled[0]).toBeCloseTo(1.5);
  });

  it('treats an all-dry crop as valid: grid null, coverage still parsed', async () => {
    // The crop drops zero cells, so a dry neighborhood returns a bare header.
    fetchMock.mockResolvedValueOnce(csvResponse([], '202609171700'));

    const result = await fetchLocalRainNowcast(22.3, 114.2);

    expect(result.grid).toBeNull();
    expect(result.coverageEndMs).toBe(Date.UTC(2026, 8, 17, 9, 0));
    expect(result.updateTime).toBe('');
  });

  it('returns null coverage when the header is missing or unparseable', async () => {
    fetchMock.mockResolvedValueOnce(csvResponse([], ''));
    expect((await fetchLocalRainNowcast(22.3, 114.2)).coverageEndMs).toBeNull();

    fetchMock.mockResolvedValueOnce(csvResponse([], 'nonsense'));
    expect((await fetchLocalRainNowcast(22.3, 114.2)).coverageEndMs).toBeNull();
  });

  it('throws on non-OK responses so callers fall back silently', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not found', { status: 404 }));
    await expect(fetchLocalRainNowcast(22.3, 114.2)).rejects.toThrow('404');
  });

  it('rejects when the external signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockResolvedValueOnce(csvResponse([row(22.3, 114.2, 1)]));
    await expect(fetchLocalRainNowcast(22.3, 114.2, controller.signal)).rejects.toThrow();
    // The request must never go out for an already-cancelled query.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
