/**
 * Vercel Serverless Function: HKO gridded rainfall nowcast proxy.
 *
 * Two modes:
 *
 * GET /api/nowcast?lat=22.30&lon=114.20  (crop — rain-start banner)
 *
 * HKO's full gridded nowcast CSV is ~2.7 MB (121×121 cells × ~4 steps, 98.8%
 * zero rows on a dry day) — acceptable for the opt-in rain map, far too heavy
 * to auto-load per session for the rain-start banner. The crop mode fetches
 * the source file from HKO and returns only the cells within CROP_SPAN_DEG of
 * the requested point (a ~11 km square ≈ 11×10 cells; zero-value rows are
 * dropped) — a few KB, so the banner can upgrade to district accuracy for
 * every in-region session.
 *
 * A fully-dry crop is a VALID outcome (HKO publishes the full grid and it is
 * genuinely dry here), not an error: the response is a header-only CSV. The
 * X-Nowcast-Coverage-Until header carries the source file's domain-wide last
 * step end so the client can still treat "dry within the crop" as
 * district-authoritative for the file's horizon (see nowcastLocal.ts).
 *
 * GET /api/nowcast?mode=full          (full — rain map, RainfallMapInner)
 * HEAD /api/nowcast?mode=full         (freshness probe)
 *
 * The full mode streams the whole domain, forwarding only value > 0 rows
 * (no crop box): the map's client parser already drops zeros, so filtering
 * here shrinks the wire payload from the ~2.7 MB source file to the sparse
 * rain rows without any client change. HKO's Last-Modified header is
 * forwarded (and CORS-exposed) so the map's HML-43 freshness probe — a HEAD
 * compare against the previous fetch before deciding to re-download — works
 * against this function instead of the raw file. lat/lon are deliberately
 * IGNORED in this mode so the URL is identical for every user worldwide and
 * the CDN serves one global s-maxage=300 entry.
 *
 * Error contract, per mode: any failure BEFORE the response is committed
 * (upstream fetch throws, non-OK status, or — crop mode only — the buffered
 * body read fails) surfaces as the 502 JSON contract. The full mode commits
 * its response as soon as upstream headers arrive (streaming keeps TTFB low
 * and avoids buffering 2.7 MB per invocation), so a body that fails
 * mid-stream truncates the CSV instead: an errored stream surfaces through
 * the map's stale-data path, while a cleanly-closed early one renders
 * whatever rows made it through as fresh data — the client parser tolerates
 * both. Crop mode stays fully-buffered — the banner's 502 contract (review
 * round 4) depends on it.
 *
 * Exported as named HTTP methods (`GET`/`HEAD`) — that is the Web fetch-style
 * contract this runtime supports (same as api/feedback.ts; a default export
 * is interpreted as the legacy Node (req, res) signature there).
 *
 * The endpoint is public and reads no secrets. CORS is open for the native
 * Capacitor webview origins (`https://localhost` / `capacitor://localhost`)
 * — reachable only inside the app sandbox — mirroring api/feedback.ts.
 * `Cache-Control: s-maxage` lets the Vercel CDN serve repeated requests
 * without invoking the function at all (HKO regenerates the file every
 * ~6-10 min, so 5 min of edge caching keeps it near-fresh). Last-Modified is
 * NOT a CORS-safelisted response header — without Access-Control-Expose-
 * Headers the native build (cross-origin via VITE_API_BASE) could never read
 * it, the probe would always report null, and every refetch would download.
 */

const HKO_NOWCAST_CSV_URL =
  'https://data.weather.gov.hk/weatherAPI/hko_data/F3/Gridded_rainfall_nowcast.csv';

/** Header line every response starts with (column order mirrors the source
 *  file; the client parser skips line 0, so the text itself is arbitrary). */
const OUTPUT_HEADER = 'UpdateTime,EndTime,Latitude,Longitude,Value_mm';

/** Shared edge-cache policy: HKO regenerates every ~6-10 min, so 5 min of
 *  CDN caching keeps responses near-fresh; stale-while-revalidate smooths
 *  the cold revalidation hit. */
const CDN_CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=600';

/**
 * Forward HKO's Last-Modified verbatim, stripping CR/LF before header
 * injection (a stray \r in a malformed HKO field would make `new Response`
 * throw — same guard the crop mode applies to the coverage stamp). Upstream
 * header values can't actually carry \r\n through undici's validation, but
 * the guard costs nothing and survives a runtime change.
 */
function sanitizedLastModified(upstream: Response): string | null {
  const lm = upstream.headers.get('last-modified');
  return lm ? lm.replace(/[\r\n]/g, '') : null;
}

/**
 * Shared response headers for the full mode (GET + HEAD). Last-Modified must
 * be CORS-exposed: it is not safelisted, and the native build reads it
 * cross-origin for the freshness probe.
 */
function fullModeHeaders(lastModified: string | null): Record<string, string> {
  return {
    'Content-Type': 'text/csv; charset=utf-8',
    'Cache-Control': CDN_CACHE_CONTROL,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'Last-Modified',
    ...(lastModified ? { 'Last-Modified': lastModified } : {}),
  };
}

/**
 * The full mode's row filter: forward only rows the client parser would keep
 * (fixed 5-column schema, non-empty EndTime, numeric value > 0). Runs on the
 * already-CR-stripped line; lat/lon are forwarded untouched — cropping is
 * not this mode's job.
 */
function isRainRow(line: string): boolean {
  const parts = line.split(',');
  if (parts.length < 5 || !parts[1]) return false;
  const value = Number.parseFloat(parts[4]);
  return Number.isFinite(value) && value > 0;
}

/**
 * Streaming line filter for the full mode: decodes upstream bytes
 * incrementally (TextDecoder keeps state across chunk boundaries), splits on
 * '\n', drops HKO's header line, and enqueues only rain rows. Trailing '\r'
 * is stripped (HKO lines may be CRLF — the crop mode's coverage-stamp guard
 * exists for the same reason). The buffer holds at most ONE partial line, so
 * the function never materializes the 2.7 MB body; bytes start flowing to
 * the client as soon as upstream headers arrive.
 */
function rainRowFilterStream(): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let partial = '';
  let headerSkipped = false;
  const processLine = (
    rawLine: string,
    controller: TransformStreamDefaultController<Uint8Array>,
  ): void => {
    // Source line 0 is HKO's own header; every response instead starts with
    // our canonical OUTPUT_HEADER.
    if (!headerSkipped) {
      headerSkipped = true;
      return;
    }
    const line = rawLine.replace(/\r$/, '');
    if (!line || !isRainRow(line)) return;
    controller.enqueue(encoder.encode(line + '\n'));
  };
  return new TransformStream({
    // The response always starts with our canonical header line — even on a
    // fully-dry day with zero forwarded rows (crop mode does the same), so
    // the body is always a parseable CSV.
    start(controller) {
      controller.enqueue(encoder.encode(OUTPUT_HEADER + '\n'));
    },
    transform(chunk, controller) {
      partial += decoder.decode(chunk, { stream: true });
      const lines = partial.split('\n');
      partial = lines.pop() ?? '';
      for (const line of lines) processLine(line, controller);
    },
    flush(controller) {
      // A file without a trailing newline still gets its last row forwarded.
      partial += decoder.decode();
      if (partial) processLine(partial, controller);
    },
  });
}

/**
 * Half-width of the crop box in degrees. HKO cell spacing is ~0.018° lat /
 * ~0.0195° lon, so ±0.1° ≈ ±5 cells each way ≈ an 11 km square centered on
 * the requested point — "neighborhood" at HKO's nowcast resolution without
 * sampling single-cell noise.
 */
const CROP_SPAN_DEG = 0.1;

/** Upstream budget for the HKO fetch. The client's own budget is 10 s
 *  (LOCAL_NOWCAST_TIMEOUT_MS) — deliberately larger, so a cold fetch where
 *  the function spends its full budget on HKO still completes client-side. */
const UPSTREAM_TIMEOUT_MS = 8000;

/** Generous domain check (the grid spans roughly the Pearl River Delta);
 *  the client gates on isInRainfallRegion before calling. */
function isValidCoords(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= 20 && lat <= 26 && lon >= 110 && lon <= 118
  );
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (url.searchParams.get('mode') === 'full') return fullModeNowcast();
  const latRaw = Number(url.searchParams.get('lat'));
  const lonRaw = Number(url.searchParams.get('lon'));
  if (!isValidCoords(latRaw, lonRaw)) {
    return jsonResponse(400, { error: 'invalid_coords' });
  }
  // Quantize to the 3-decimal cell-center space the client sends (both sides
  // do it: the client so one CDN key serves all GPS fixes near a point, the
  // server so crop content is deterministic regardless of extra decimals).
  const lat = Math.round(latRaw * 1000) / 1000;
  const lon = Math.round(lonRaw * 1000) / 1000;

  let upstream: Response;
  let source: string;
  try {
    upstream = await fetch(HKO_NOWCAST_CSV_URL, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!upstream.ok) {
      return jsonResponse(502, { error: 'upstream_error' });
    }
    // Inside the try: a timeout firing mid-body or a mid-stream reset must
    // surface as the file's 502 contract, not an unhandled platform 500.
    source = await upstream.text();
  } catch {
    return jsonResponse(502, { error: 'upstream_unreachable' });
  }
  // Fixed-schema CSV (5 columns, no quoting — same guarantee the client-side
  // parser in rainfallGrid.ts relies on): UpdateTime, EndTime, Lat, Lon, Value.
  // Line 0 is a header, skipped like the client parser does.
  const lines = source.split('\n');
  const kept: string[] = [];
  // Domain-wide last step end. HKO stamps are fixed-width zero-padded
  // "YYYYMMDDHHmm", so lexicographic compare = chronological compare.
  let coverageEnd = '';
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const parts = line.split(',');
    if (parts.length < 5) continue;
    const endTime = parts[1];
    if (!endTime) continue;
    if (endTime > coverageEnd) coverageEnd = endTime;
    const value = Number.parseFloat(parts[4]);
    if (!Number.isFinite(value) || value <= 0) continue;
    const cellLat = Number.parseFloat(parts[2]);
    const cellLon = Number.parseFloat(parts[3]);
    if (!Number.isFinite(cellLat) || !Number.isFinite(cellLon)) continue;
    if (
      Math.abs(cellLat - lat) <= CROP_SPAN_DEG &&
      Math.abs(cellLon - lon) <= CROP_SPAN_DEG
    ) {
      kept.push(line);
    }
  }

  // Header text is arbitrary (the client parser skips line 0); the column
  // order below mirrors the source file.
  const body = [OUTPUT_HEADER, ...kept].join('\n');
  // Strip to digits before header injection: a stray \r in a malformed HKO
  // field would make `new Response` throw (500).
  coverageEnd = coverageEnd.replace(/\D/g, '');
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': CDN_CACHE_CONTROL,
      'Access-Control-Allow-Origin': '*',
      // The fetch spec hides non-safelisted response headers from
      // cross-origin reads — the native Capacitor build (VITE_API_BASE =
      // vercel.app) would never see the coverage stamp without this, and
      // the district-authority merge would silently never engage there.
      'Access-Control-Expose-Headers': 'X-Nowcast-Coverage-Until',
      ...(coverageEnd ? { 'X-Nowcast-Coverage-Until': coverageEnd } : {}),
    },
  });
}

/**
 * Full mode: stream HKO's file through the rain-row filter, forwarding HKO's
 * Last-Modified. No coords: the URL is one global CDN key. Failure before
 * commit → the 502 contract; failure mid-stream → truncated CSV (see the
 * file doc comment for why that asymmetry is intentional).
 */
async function fullModeNowcast(): Promise<Response> {
  // Cancellable timer (NOT AbortSignal.timeout like the crop path): the cap
  // must only cover the headers wait. AbortSignal.timeout cannot be
  // disarmed, so it would truncate a healthy-but-slow body at 8 s wall
  // clock; once headers arrive the timer is released and the tail is
  // governed by the client's own 10 s no-bytes stall watchdog (plus the
  // platform's invocation cap), not by this fixed budget.
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException('upstream timeout', 'TimeoutError')),
    UPSTREAM_TIMEOUT_MS,
  );
  let upstream: Response;
  try {
    upstream = await fetch(HKO_NOWCAST_CSV_URL, { signal: controller.signal });
  } catch {
    clearTimeout(timer);
    return jsonResponse(502, { error: 'upstream_unreachable' });
  }
  if (!upstream.ok) {
    clearTimeout(timer);
    return jsonResponse(502, { error: 'upstream_error' });
  }
  const lastModified = sanitizedLastModified(upstream);

  // Streaming responses never carry Content-Length (size unknown until the
  // filter has run), so the client's progress bar runs in its indeterminate
  // "bytes received" mode — already implemented and fine.
  if (!upstream.body) {
    // No streamable body (exotic runtime / 204-style response): fall back to
    // the crop mode's fully-buffered contract, which also owns the 502
    // mapping for a body read that dies here. Stays under the timer — an
    // unbounded .text() read would hang past the budget with no client
    // watchdog on this path.
    try {
      const text = await upstream.text();
      // Same CR strip as the streaming filter so both paths emit identical bytes.
      const body = [
        OUTPUT_HEADER,
        ...text.split('\n').slice(1).map(l => l.replace(/\r$/, '')).filter(isRainRow),
      ].join('\n');
      return new Response(body, { status: 200, headers: fullModeHeaders(lastModified) });
    } catch {
      return jsonResponse(502, { error: 'upstream_error' });
    } finally {
      clearTimeout(timer);
    }
  }
  // Headers are in: release the cap before committing the stream.
  clearTimeout(timer);
  return new Response(upstream.body.pipeThrough(rainRowFilterStream()), {
    status: 200,
    headers: fullModeHeaders(lastModified),
  });
}

/**
 * HEAD /api/nowcast?mode=full — the map's freshness probe. HKO honours HEAD
 * on the CSV (returns headers only, with Last-Modified; verified 2026-11-09),
 * so the probe costs the function a headers-only upstream round-trip instead
 * of a 2.7 MB download. Same cache/CORS/Last-Modified headers as the GET so
 * the CDN caches the probe separately but symmetrically; the body is empty
 * (HEAD responses must not carry one). Only mode=full is valid — the probe
 * is the full mode's client; crop URLs have no probe contract.
 */
export async function HEAD(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (url.searchParams.get('mode') !== 'full') {
    return new Response(null, { status: 400 });
  }
  let upstream: Response;
  try {
    upstream = await fetch(HKO_NOWCAST_CSV_URL, {
      method: 'HEAD',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return new Response(null, { status: 502 });
  }
  if (!upstream.ok) {
    return new Response(null, { status: 502 });
  }
  return new Response(null, {
    status: 200,
    headers: fullModeHeaders(sanitizedLastModified(upstream)),
  });
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
