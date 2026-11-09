// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
// Named HTTP-method exports — the Web fetch-style contract the Vercel Node
// runtime honours (same as api/feedback.ts). Aliased for brevity.
import { GET as handler, HEAD as headHandler } from './nowcast';

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

  it('surfaces a mid-body stream failure as 502, not an unhandled 500', async () => {
    // Headers arrived, body died (timeout firing mid-download, connection
    // reset): the body read must stay inside the 502 contract.
    const dying = new ReadableStream({
      start(controller) {
        controller.error(new Error('mid-body reset'));
      },
    });
    fetchMock.mockResolvedValueOnce(new Response(dying, { status: 200 }));
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
    // The coverage stamp must be readable cross-origin: the native build
    // fetches from another origin, and the fetch spec hides non-safelisted
    // headers unless they are explicitly exposed.
    expect(res.headers.get('access-control-expose-headers')).toContain('X-Nowcast-Coverage-Until');
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

  describe('mode=full (rain map stream)', () => {
    function runFull(extraQuery = ''): Promise<Response> {
      return handler(new Request(`https://app.test/api/nowcast?mode=full${extraQuery}`));
    }

    /** Upstream body as real byte chunks, split at awkward line boundaries. */
    function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
      const encoder = new TextEncoder();
      return new ReadableStream({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      });
    }

    it('forwards rain rows domain-wide with no crop box', async () => {
      fetchMock.mockResolvedValueOnce(new Response(streamOf([
        HEADER + '\n',
        row(22.30, 114.20, 1.5) + '\n',
        row(49.28, -123.12, 9.0) + '\n', // Vancouver — far outside the PRD, still kept
        row(22.3, 114.2, 0.0) + '\n',    // zero — dropped
        row(22.3, 114.2, -1) + '\n',     // negative — dropped
        'garbage\n',                     // malformed — dropped
      ]), { status: 200 }));

      const res = await runFull();
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/csv');
      expect(res.headers.get('cache-control')).toContain('s-maxage=300');
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      const body = await res.text();
      const lines = body.split('\n');
      expect(lines[0]).toBe(HEADER);
      // header + 2 rows, then '' from the trailing newline each streamed row carries
      expect(lines).toHaveLength(4);
      expect(lines[3]).toBe('');
      expect(body).toContain('9.00'); // no crop box: the far row survives
    });

    it('needs no coords and ignores stray ones so the CDN key stays global', async () => {
      const upstream = new Response(streamOf([
        HEADER + '\n' + row(49.28, -123.12, 9.0) + '\n',
      ]), { status: 200 });
      fetchMock.mockResolvedValueOnce(upstream.clone()).mockResolvedValueOnce(upstream.clone());

      const bare = await runFull();
      const withCoords = await runFull('&lat=22.3&lon=114.2');
      expect(bare.status).toBe(200);
      expect(withCoords.status).toBe(200);
      // Identical bodies: coords must not fork the cache entry, and the
      // far-away row proves no crop was applied to the coord-ful variant.
      const bareBody = await bare.text();
      expect(await withCoords.text()).toBe(bareBody);
      expect(bareBody).toContain('9.00');
    });

    it('forwards HKO Last-Modified and exposes it to cross-origin reads', async () => {
      const lm = 'Mon, 09 Nov 2026 17:45:57 GMT';
      fetchMock.mockResolvedValueOnce(new Response(streamOf([HEADER + '\n']), {
        status: 200,
        headers: { 'Last-Modified': lm },
      }));
      const res = await runFull();
      // Not CORS-safelisted: without Access-Control-Expose-Headers the native
      // build could never read it and the freshness probe would always miss.
      expect(res.headers.get('last-modified')).toBe(lm);
      expect(res.headers.get('access-control-expose-headers')).toContain('Last-Modified');
    });

    it('surfaces upstream failure as 502 before the response commits', async () => {
      fetchMock.mockRejectedValueOnce(new Error('HKO down'));
      expect((await runFull()).status).toBe(502);
      fetchMock.mockResolvedValueOnce(new Response(streamOf([HEADER + '\n']), { status: 503 }));
      expect((await runFull()).status).toBe(502);
    });

    it('truncates instead of 502ing when the body dies after commit', async () => {
      // Streaming contract: status 200 goes out with upstream headers; a
      // mid-body reset truncates the CSV. The client parser tolerates
      // partial rows and falls to the map's stale-data path — this is the
      // documented asymmetry vs the crop mode's buffered 502 contract.
      const encoder = new TextEncoder();
      const dying = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(HEADER + '\n' + row(22.3, 114.2, 1.0) + '\npartial'));
          controller.error(new Error('mid-body reset'));
        },
      });
      fetchMock.mockResolvedValueOnce(new Response(dying, { status: 200 }));
      const res = await runFull();
      expect(res.status).toBe(200);
      await expect(res.text()).rejects.toThrow();
    });

    it('reassembles lines split across chunks and strips CRLF', async () => {
      // Chunks split mid-header-token, mid-field, and between \r and \n.
      const chunks = [
        'UpdateTime,EndTime,Latitude,Longitude,Val',
        'ue_mm\r\n202609171600,202609171630,22.3',
        '00,114.200,1.50\r\n202609171600,202609171630,22.310,114.210,2.00\r',
        '\n',
      ];
      fetchMock.mockResolvedValueOnce(new Response(streamOf(chunks), { status: 200 }));
      const res = await runFull();
      expect(await res.text()).toBe(
        [HEADER, row(22.30, 114.20, 1.5), row(22.31, 114.21, 2.0)].join('\n') + '\n',
      );
    });

    it('forwards a final row that lacks a trailing newline', async () => {
      fetchMock.mockResolvedValueOnce(new Response(streamOf([
        HEADER + '\n' + row(22.3, 114.2, 1.0),
      ]), { status: 200 }));
      const res = await runFull();
      expect(await res.text()).toBe(HEADER + '\n' + row(22.3, 114.2, 1.0) + '\n');
    });

    it('falls back to buffered filtering when upstream has no stream', async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
      const res = await runFull();
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(HEADER);
    });

    it('aborts a headers-stalled upstream at the budget as 502', async () => {
      vi.useFakeTimers();
      try {
        // Fetch that honours the abort signal like undici does, then never
        // resolves: the wall-clock cap must fire during the headers wait.
        fetchMock.mockImplementationOnce(
          (_url: unknown, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
            }),
        );
        const pending = runFull();
        await vi.runAllTimersAsync();
        const res = await pending;
        expect(res.status).toBe(502);
        expect(vi.getTimerCount()).toBe(0); // abort path cleans up too
      } finally {
        vi.useRealTimers();
      }
    });

    it('releases the upstream timeout once headers arrive', async () => {
      vi.useFakeTimers();
      try {
        fetchMock.mockResolvedValueOnce(new Response(streamOf([
          HEADER + '\n' + row(22.3, 114.2, 1.0) + '\n',
        ]), { status: 200 }));
        const before = vi.getTimerCount();
        const res = await runFull();
        expect(res.status).toBe(200);
        expect(await res.text()).toContain('1.00');
        // No pending upstream timer after commit: a healthy-but-slow body is
        // bounded by the client's stall watchdog, not truncated at 8 s wall
        // clock (the old AbortSignal.timeout would have done exactly that).
        expect(vi.getTimerCount()).toBe(before);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('HEAD freshness probe (mode=full)', () => {
    function runHead(url = 'https://app.test/api/nowcast?mode=full'): Promise<Response> {
      return headHandler(new Request(url, { method: 'HEAD' }));
    }

    it('answers from a headers-only upstream HEAD and forwards Last-Modified', async () => {
      const lm = 'Mon, 09 Nov 2026 17:45:57 GMT';
      fetchMock.mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: { 'Last-Modified': lm },
      }));
      const res = await runHead();
      expect(res.status).toBe(200);
      expect(res.headers.get('last-modified')).toBe(lm);
      expect(res.headers.get('access-control-expose-headers')).toContain('Last-Modified');
      expect(res.headers.get('cache-control')).toContain('s-maxage=300');
      expect(await res.text()).toBe('');
      // The upstream probe must be a headers-only HEAD, never a download.
      expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('HEAD');
    });

    it('rejects non-full modes without touching HKO', async () => {
      const res = await runHead('https://app.test/api/nowcast?lat=22.3&lon=114.2');
      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('surfaces upstream failure as 502', async () => {
      fetchMock.mockRejectedValueOnce(new Error('HKO down'));
      expect((await runHead()).status).toBe(502);
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
      expect((await runHead()).status).toBe(502);
    });
  });
});
