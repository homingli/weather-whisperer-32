/**
 * District-scale rain nowcast for the rain-start banner: a KB-sized crop of
 * the HKO gridded nowcast around the selected location, served by the
 * `/api/nowcast` Vercel function (api/nowcast.ts — the source file is a
 * 2.7 MB CSV, fine for the opt-in rain map, too heavy to auto-load).
 *
 * Consumer contract:
 *  - HTTP/network failure THROWS → React Query error state → callers fall
 *    back to Open-Meteo or the full-domain grid. Silent by design: dev has
 *    no `/api` route (the Vite proxy only covers /hko-data and /aqhi-rss),
 *    and a degraded fetch must never surface as app breakage.
 *  - A 200 with zero rain rows is a VALID outcome: `grid` is null and means
 *    "HKO says no rain within the crop" (the crop drops zero cells). The
 *    `coverageEndMs` span still applies — see RainStartBanner.
 */

import { buildRainGrid, hkoStepEndToEpoch, parseRainfallCSVText, type RainGrid } from './rainfallGrid';
import { TIMING } from './constants';

/** Same base-URL convention as src/lib/feedback.ts: web builds call the
 *  same-origin endpoint; native builds point VITE_API_BASE at the deployed
 *  site so the Capacitor webview reaches the same function. */
const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export interface LocalRainNowcast {
  /** Parsed crop grid, or null when every cropped cell was dry (valid). */
  grid: RainGrid | null;
  /** Parsed update-time string ("YYYY-MM-DD HH:mm"), '' when unavailable. */
  updateTime: string;
  /** Raw "YYYYMMDDHHmm" domain-wide last step end from the response header. */
  coverageEndRaw: string;
  /** Epoch ms of `coverageEndRaw`, null when the header was missing or
   *  unparseable (callers fall back to a conservative fixed span). */
  coverageEndMs: number | null;
}

/**
 * Quantized (3-decimal ≈ HKO cell-center precision) query key so the
 * auto-load hook (useNowcastAutoLoad) and the banner's read-only
 * subscription always land on the same cache entry.
 */
export function localNowcastQueryKey(lat: number, lon: number): readonly [string, number, number] {
  return ['hkoLocalRainNowcast', Math.round(lat * 1000), Math.round(lon * 1000)];
}

/**
 * Fetch and parse the cropped nowcast. The payload is a few KB, so a simple
 * fixed timeout replaces the full stall-aware streaming machinery the 2.7 MB
 * map fetch needs (RainfallMapInner). The React Query signal is forwarded so
 * a superseded query cancels the in-flight request.
 */
export async function fetchLocalRainNowcast(
  lat: number,
  lon: number,
  externalSignal?: AbortSignal,
): Promise<LocalRainNowcast> {
  // An already-cancelled query must not reach the network at all.
  if (externalSignal?.aborted) {
    throw new DOMException('Local nowcast fetch cancelled', 'AbortError');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException('Local nowcast fetch timed out', 'TimeoutError'));
  }, TIMING.OPEN_METEO_TIMEOUT_MS);

  const detachExternal = (() => {
    if (!externalSignal) return null;
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
      return null;
    }
    const onAbort = () => controller.abort(externalSignal.reason);
    externalSignal.addEventListener('abort', onAbort);
    return () => externalSignal.removeEventListener('abort', onAbort);
  })();

  try {
    const response = await fetch(
      `${API_BASE}/api/nowcast?lat=${lat}&lon=${lon}`,
      { signal: controller.signal },
    );
    if (!response.ok) throw new Error(`Local nowcast fetch failed: ${response.status}`);

    const csvText = await response.text();
    const parsed = parseRainfallCSVText(csvText);
    const coverageEndRaw = response.headers.get('x-nowcast-coverage-until') ?? '';
    return {
      grid: buildRainGrid(parsed.rows),
      updateTime: parsed.updateTime,
      coverageEndRaw,
      coverageEndMs: hkoStepEndToEpoch(coverageEndRaw),
    };
  } finally {
    clearTimeout(timer);
    detachExternal?.();
  }
}
