/**
 * Vercel Serverless Function: HKO gridded rainfall nowcast crop proxy.
 *
 * GET /api/nowcast?lat=22.30&lon=114.20
 *
 * HKO's full gridded nowcast CSV is ~2.7 MB (121×121 cells × ~4 steps, 98.8%
 * zero rows on a dry day) — acceptable for the opt-in rain map, far too heavy
 * to auto-load per session for the rain-start banner. This endpoint fetches
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
 * Exported as a named HTTP method (`GET`) — that is the Web fetch-style
 * contract this runtime supports (same as api/feedback.ts; a default export
 * is interpreted as the legacy Node (req, res) signature there).
 *
 * The endpoint is public and reads no secrets. CORS is open for the native
 * Capacitor webview origins (`https://localhost` / `capacitor://localhost`)
 * — reachable only inside the app sandbox — mirroring api/feedback.ts.
 * `Cache-Control: s-maxage` lets the Vercel CDN serve repeated requests for
 * the same location without invoking the function at all (HKO regenerates
 * the file every ~6-10 min, so 5 min of edge caching keeps it near-fresh).
 */

const HKO_NOWCAST_CSV_URL =
  'https://data.weather.gov.hk/weatherAPI/hko_data/F3/Gridded_rainfall_nowcast.csv';

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
  try {
    upstream = await fetch(HKO_NOWCAST_CSV_URL, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return jsonResponse(502, { error: 'upstream_unreachable' });
  }
  if (!upstream.ok) {
    return jsonResponse(502, { error: 'upstream_error' });
  }

  // Fixed-schema CSV (5 columns, no quoting — same guarantee the client-side
  // parser in rainfallGrid.ts relies on): UpdateTime, EndTime, Lat, Lon, Value.
  // Line 0 is a header, skipped like the client parser does.
  const source = await upstream.text();
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
  const body = ['UpdateTime,EndTime,Latitude,Longitude,Value_mm', ...kept].join('\n');
  // Strip to digits before header injection: a stray \r in a malformed HKO
  // field would make `new Response` throw (500).
  coverageEnd = coverageEnd.replace(/\D/g, '');
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      'Access-Control-Allow-Origin': '*',
      ...(coverageEnd ? { 'X-Nowcast-Coverage-Until': coverageEnd } : {}),
    },
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
