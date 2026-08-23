// Idle-time prefetch for the MSC (Vancouver) nowcast map.
//
// The map's first render pays three cold costs once the user swipes to the
// nowcast slide: the lazy leaflet chunk (~150 kB gz), the Carto basemap
// tiles, and the GeoMet WMS overlay/probe tiles. The basemap is handled by
// the SW runtime cache (CacheFirst, see vite.config.ts); this module warms
// the two warmable pieces as soon as the selected city is in the Vancouver
// box — before the slide renders — so the map mounts from the HTTP cache
// instead of the network.
//
// What it prefetches:
//   1. The map's lazy chunk (leaflet + react-leaflet + MSCRainfallMapInner).
//      Vite dedupes this dynamic import with the MSCRainfallMap lazy() chunk,
//      so it lands under the same URL the map will request.
//   2. The per-step bbox probe tiles (256×256 GetMap via the shared
//      `buildProbeUrl`). These are exactly the URLs the map's
//      no-precipitation probe fetches after first render, so the probe
//      resolves from cache. The map's viewport-zoom overlay tiles can't be
//      prefetched without replicating Leaflet's tile math, so they ride the
//      HTTP/SW cache after the first pass.
//
// Guardrails:
//   - Fires once per session. Probe tiles are time-stamped; a stale warm-up
//     is harmless because the map refetches what it needs on mount and
//     GeoMet's Cache-Control: max-age=3600 bounds how long a warmed entry
//     lives.
//   - Network-gated (`shouldSkipPrefetch`): skips on saveData / slow-2g / 2g
//     so prefetching never competes with first paint or burns precious data
//     on mobile.
//   - Idle-scheduled (requestIdleCallback) so it yields to input/rendering.

import { buildMscStepTimes, buildProbeUrl } from './msc-wms';

/**
 * Connection metadata subset used for prefetch gating.
 * `navigator.connection` is a Chromium-only NetworkInformation; other
 * browsers leave it undefined — prefetching defaults to ON there (the
 * warm-up is idle-scheduled and cheap).
 */
export interface PrefetchConnectionInfo {
  saveData?: boolean;
  effectiveType?: string;
}

/** Skip the prefetch when the user is on a constrained connection. */
export function shouldSkipPrefetch(conn?: PrefetchConnectionInfo | null): boolean {
  if (!conn) return false;
  if (conn.saveData) return true;
  return conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g';
}

/** Idle-callback deadline: run the warm-up within 5 s even under load. */
const IDLE_TIMEOUT_MS = 5000;

/** One-shot per session — see the module docstring for why that's safe. */
let prefetchStarted = false;

/**
 * Warm the MSC nowcast assets at idle, once. Safe to call on every render of
 * the Vancouver path — subsequent calls are no-ops.
 */
export function prefetchMscNowcast(): void {
  if (typeof window === 'undefined') return;
  if (prefetchStarted) return;
  const conn = (navigator as Navigator & { connection?: PrefetchConnectionInfo }).connection;
  if (shouldSkipPrefetch(conn)) return;
  prefetchStarted = true;
  // Capture before the branch: `requestIdleCallback` is a required DOM
  // member, so `'requestIdleCallback' in window` would narrow `window` to
  // `never` in the else branch. Test the captured function instead.
  const idle = window.requestIdleCallback;
  if (idle) {
    idle(warmNowcastAssets, { timeout: IDLE_TIMEOUT_MS });
  } else {
    window.setTimeout(warmNowcastAssets, 0);
  }
}

function warmNowcastAssets(): void {
  // 1. The map's lazy chunk — the single largest first-render fetch.
  void import('@/components/MSCRainfallMapInner');

  // 2. The 6 per-step bbox probe tiles — what the map's probe phase requests.
  const { steps } = buildMscStepTimes(new Date());
  for (const step of steps) {
    warmImage(buildProbeUrl(step));
  }
}

/** Fire-and-forget image load; the response lands in the HTTP cache. */
function warmImage(url: string): void {
  const img = new Image();
  img.crossOrigin = 'anonymous'; // matches the probe's CORS mode
  img.src = url;
}
