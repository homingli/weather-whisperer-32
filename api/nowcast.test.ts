// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
// Named HTTP-method export — the Web fetch-style contract the Vercel Node
// runtime honours (same as api/feedback.ts). Aliased to `handler` for brevity.
import { GET as handler } from './nowcast';

/** One synthetic HKO nowcast row: UpdateTime, EndTime, Lat, Lon, Value. */
function row(lat: number, lon: number, value: number, endTime = '202609171630'): string {
  return `202609171600,${endTime},${lat.toFixed(3)},${lon.toFixed(3)},${value.toFixed(2)}`;
}

const HEADER = 'UpdateTime,EndTime,Latitude,Longitude,Value_mm';

function csv(lines: string[]): string {
  return [HEADER, ...lines].join('\n');
}

function get(lat: number | string, lon: number | string): Promise<Response> {
  return handler(new Request(`https://app.test/api/nowcast?lat=${lat}&lon=${lon}`));
}

describe('api/nowcast', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('rejects missing, non-numeric, and out-of-domain coords without touching HKO', async () => {
    expect((await get('abc', '114.2')).status).toBe(400);
    expect((await get('22.3', 'abc')).status).toBe(400);
    expect((await get('22.3', '')).status).toBe(400);
    expect((await get('48.4', '-123.1')).status).toBe(400); // Vancouver
    expect((await get('61', '114.2')).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces upstream failure as 502', async () => {
    fetchMock.mockRejectedValueOnce(new Error('HKO down'));
    expect((await get('22.3', '114.2')).status).toBe(502);
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 503 }));
    expect((await get('22.3', '114.2')).status).toBe(502);
  });

  it('keeps only rain cells inside the crop box and drops zeros', async () => {
    // Grid spacing ~0.018°/0.0195°. Center on (22.30, 114.20); ±0.1° box.
    fetchMock.mockResolvedValueOnce(new Response(csv([
      row(22.30, 114.20, 1.5),  // center — kept
      row(22.38, 114.28, 2.0),  // inside (dlat 0.08, dlon 0.08) — kept
      row(22.41, 114.20, 3.0),  // outside the lat edge (|dlat| = 0.11 > 0.1) — dropped
      row(22.3, 114.35, 4.0),   // outside lon — dropped
      row(22.3, 114.2, 0.0),    // zero — dropped
      row(22.3, 114.2, -1),     // negative — dropped
      row(49.28, -123.12, 9.0), // far away — dropped
    ]), { status: 200 }));

    const res = await get('22.3', '114.2');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('cache-control')).toContain('s-maxage=300');

    const body = await res.text();
    const lines = body.split('\n');
    expect(lines[0]).toBe(HEADER);
    expect(lines).toHaveLength(3); // header + 2 kept rows
    expect(body).toContain('1.50');
    expect(body).toContain('2.00');
    expect(body).not.toContain('3.00'); // 22.410 is outside the ±0.1 box
    expect(body).not.toContain('9.00');
  });

  it('reports the domain-wide coverage end even when the crop is all-dry', async () => {
    // Rain far from the requested point: crop keeps nothing, but the file's
    // horizon (max EndTime across ALL rows) must still reach the client.
    fetchMock.mockResolvedValueOnce(new Response(csv([
      row(22.30, 114.20, 0),
      row(22.50, 114.40, 2.5, '202609171700'),
      row(22.50, 114.40, 3.5, '202609171630'),
    ]), { status: 200 }));

    const res = await get('22.3', '114.2');
    expect(res.status).toBe(200);
    expect(res.headers.get('x-nowcast-coverage-until')).toBe('202609171700');
    expect((await res.text()).split('\n')).toHaveLength(1); // header only
  });

  it('returns a bare header for an empty upstream file', async () => {
    fetchMock.mockResolvedValueOnce(new Response(HEADER, { status: 200 }));
    const res = await get('22.3', '114.2');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(HEADER);
    // No coverage header when the file carries no rows at all.
    expect(res.headers.get('x-nowcast-coverage-until')).toBeNull();
  });

  it('drops malformed rows without failing the whole response', async () => {
    fetchMock.mockResolvedValueOnce(new Response(csv([
      'garbage',
      row(22.30, 114.20, 1.0),
      'a,b,c',
    ]), { status: 200 }));
    const res = await get('22.3', '114.2');
    expect(res.status).toBe(200);
    const lines = (await res.text()).split('\n');
    expect(lines).toHaveLength(2); // header + the one valid row
  });

  it('quantizes coordinates so GPS-grade decimals land on the same crop', async () => {
    // 22.30047 and 22.3 quantize to the same 3-decimal center → identical
    // crop content, so the CDN keys the client actually sends collapse.
    fetchMock.mockResolvedValueOnce(new Response(csv([
      row(22.38, 114.28, 2.0),
    ]), { status: 200 }));
    const precise = await get('22.30047', '114.20012');
    expect(await precise.text()).toBe(await new Response(csv([row(22.38, 114.28, 2.0)])).text());
  });

  it('sanitizes the coverage header against malformed upstream stamps', async () => {
    fetchMock.mockResolvedValueOnce(new Response(csv([
      row(22.30, 114.20, 1.0, '20260917163\r0'),
    ]), { status: 200 }));
    const res = await get('22.3', '114.2');
    // A stray \r must not crash response construction; digits survive.
    expect(res.status).toBe(200);
    expect(res.headers.get('x-nowcast-coverage-until')).toBe('202609171630');
  });
});
