// Idle-time prefetch for the MSC (Vancouver) nowcast map.
//
// The map's first render pays three cold costs once the user swipes to the
// nowcast slide: the lazy leaflet chunk (~150 kB gz), the Carto basemap
// tiles, and the GeoMet WMS overlay/probe tiles. The basemap is handled by
// the SW runtime cache (CacheFirst, see vite.config.ts); this module warms
// the warmable pieces as soon as the selected city is in the Vancouver box —
// before the slide renders — so the map mounts from the HTTP cache instead
// of the network.
//
// What it prefetches:
//   1. The map's lazy chunk (leaflet + react-leaflet + MSCRainfallMapInner).
//      Vite dedupes this dynamic import with the MSCRainfallMap lazy() chunk,
//      so it lands under the same URL the map will request.
//   2. Per-step bbox probe tiles (256×256 GetMap via the shared
//      `buildProbeUrl`) — exactly the URLs the map's no-precipitation probe
//      fetches after first render, so the probe resolves from cache. The
//      map's viewport-zoom overlay tiles can't be prefetched without
//      replicating Leaflet's tile math, so they ride the HTTP/SW cache after
//      the first pass.
//
// How much it warms (data budget — the point of the tiers):
//   - 'full'    (desktop / fine pointer): the chunk + all 6 per-step probes.
//               Desktop has the bandwidth and the map is in active use.
//   - 'reduced' (mobile / coarse pointer, ANY engine): the chunk + the active
//               step's probe only. The map is a couple of swipes away and may
//               never be opened, so 5 more speculative probes are unused
//               data. `pointer: coarse` is reported by every engine — Safari
//               has no navigator.connection, so this is the cross-engine
//               mobile signal (Chromium's effectiveType alone would let
//               iPhone cellular users warm the full set).
//   - 'none'    (Chromium 2g/saveData): nothing. Respects the OS/browser
//               data-saver signals when they exist.
//
// Guardrails:
//   - Fires once per session. Probe tiles are time-stamped; a stale warm-up
//     is harmless because the map refetches what it needs on mount and
//     GeoMet's Cache-Control: max-age=3600 bounds how long a warmed entry
//     lives.
//   - Offline check (schedule time AND fire time): warming while offline
//     would only fail.
//   - Idle-scheduled (requestIdleCallback) so it yields to input/rendering.
//   - Race guard: once the map mounts it fetches its own tiles, so the
//     warm-up skips probe warming when `markMscMapMounted` was called. The
//     window where the map mounts mid-warm-up is sub-tick and browsers/SW
//     coalesce identical in-flight requests, so duplicates are practically
//     impossible rather than absolutely guaranteed absent.

import { buildMscStepTimes, buildProbeUrl } from './msc-wms';

/**
 * Connection metadata subset used for prefetch gating.
 * `navigator.connection` is a Chromium-only NetworkInformation; other
 * browsers leave it undefined — the coarse-pointer tier covers mobile there.
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

/** How much of the nowcast to warm. See the module docstring. */
export type MscPrefetchTier = 'none' | 'reduced' | 'full';

/**
 * Decide the warm-up tier. `coarsePointer` is `matchMedia('(pointer: coarse)')`
 * — true on phones/tablets in every engine, which is what makes the mobile
 * budget engine-agnostic (Safari has no navigator.connection).
 */
export function planMscPrefetch(
  conn?: PrefetchConnectionInfo | null,
  coarsePointer = false,
): MscPrefetchTier {
  if (shouldSkipPrefetch(conn)) return 'none';
  return coarsePointer ? 'reduced' : 'full';
}

/** Idle-callback deadline: run the warm-up within 5 s even under load. */
const IDLE_TIMEOUT_MS = 5000;

/** One-shot per session — see the module docstring for why that's safe. */
let prefetchStarted = false;

/** Set once the MSC map mounts. The map fetches its own tiles, so a pending
 *  warm-up must not duplicate those requests (race: user swipes to the map
 *  before the idle callback fires). */
let mscMapMounted = false;

/** Called by MSCRainfallMapInner on mount. */
export function markMscMapMounted(): void {
  mscMapMounted = true;
}

/**
 * Warm the MSC nowcast assets at idle, once. Safe to call on every render of
 * the Vancouver path — subsequent calls are no-ops.
 */
export function prefetchMscNowcast(): void {
  if (typeof window === 'undefined') return;
  if (prefetchStarted) return;
  if (!navigator.onLine) return; // offline: warming would only fail
  const conn = (navigator as Navigator & { connection?: PrefetchConnectionInfo }).connection;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const tier = planMscPrefetch(conn, coarsePointer);
  if (tier === 'none') return;
  prefetchStarted = true;
  // Capture before the branch: `requestIdleCallback` is a required DOM
  // member, so `'requestIdleCallback' in window` would narrow `window` to
  // `never` in the else branch. Test the captured function instead.
  const idle = window.requestIdleCallback;
  const warm = () => warmNowcastAssets(tier);
  if (idle) {
    idle(warm, { timeout: IDLE_TIMEOUT_MS });
  } else {
    window.setTimeout(warm, 0);
  }
}

function warmNowcastAssets(tier: MscPrefetchTier): void {
  // Re-check offline at fire time: the connection can drop between scheduling
  // and the idle callback (a failed warm-up is harmless, but pointless).
  if (!navigator.onLine) return;

  // 1. The map's lazy chunk — the single largest first-render fetch. Vite
  //    dedupes an in-flight dynamic import, so this is safe even if the map
  //    is already loading.
  void import('@/components/MSCRainfallMapInner');

  // 2. Probe tiles — skipped when the map is already live (it is fetching
  //    these itself; warming would duplicate the requests).
  if (mscMapMounted) return;
  const { steps } = buildMscStepTimes(new Date());
  // 'reduced' warms only the active step (the tile the map shows first);
  // 'full' warms all 6 per-step probe tiles.
  const count = tier === 'full' ? steps.length : 1;
  for (const step of steps.slice(0, count)) {
    warmImage(buildProbeUrl(step));
  }
}

/** Fire-and-forget image load; the response lands in the HTTP cache. */
function warmImage(url: string): void {
  const img = new Image();
  img.crossOrigin = 'anonymous'; // matches the probe's CORS mode
  // A failed warm-up is fine — the map refetches on demand. The empty handler
  // just keeps the error event from surfacing as unhandled.
  img.onerror = () => {
    /* fire-and-forget */
  };
  img.src = url;
}
