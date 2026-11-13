import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useLanguage, formatString } from '@/contexts/LanguageContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { PRD_BOUNDS } from '@/lib/hko-weather';
import { TIMING } from '@/lib/constants';
import { parseRainfallCSVText, buildRainGrid, type RainGrid } from '@/lib/rainfallGrid';
import { RAINFALL_BANDS } from '@/lib/rainfallBands';
import { scheduleCacheWrite, touchNowcastCache, type NowcastCacheRead } from '@/lib/nowcastCache';
import { MapLibreMap } from './MapLibreMap';
import { rainfallGridToGeoJson } from '@/lib/rainfallGeoJson';
import {
  NowcastTimelineBar,
  MapTopRightControls,
  SlowChip,
  MapErrorOverlay,
  StaleErrorPill,
  MapLegend,
  type UserLocation,
} from './NowcastMapShared';
import { useAutoplayStep, useSlowFlag, useBasemapDark, useMapLockRef } from '@/hooks/useNowcastMap';

interface NowcastResult {
  grid: RainGrid;
  updateTime: string;
  lastModified: number;
}

// Two basemap styles: a light/clean Carto Positron tile and a dark Carto
// Dark Matter tile. The map theme defaults to the app theme (synced via
// useBasemapDark) but the switch button lets the user flip it
// independently. Tile keys are stable across the theme switch so the
// layer component remounts and fetches the new tile set on each toggle.

// Convert a grid extent into a {minLat, maxLat, minLon, maxLon} bounds object
// for the viewport-fit effect. The grid is bounded by the first/last observed
// cell centers; we expand by half a cell using the spacing between the two
// outermost centers so the fit bounds the actual painted extent.
function gridBounds(grid: RainGrid): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
  const { rows, cols, cellLats, cellLons } = grid;
  const halfLatSouth = rows >= 2 ? (cellLats[0] - cellLats[1]) / 2 : 0.009;
  const halfLatNorth = rows >= 2 ? (cellLats[rows - 1] - cellLats[rows - 2]) / 2 : 0.009;
  const halfLonWest = cols >= 2 ? (cellLons[0] - cellLons[1]) / 2 : 0.0095;
  const halfLonEast = cols >= 2 ? (cellLons[cols - 1] - cellLons[cols - 2]) / 2 : 0.0095;
  return {
    minLat: cellLats[0] + halfLatSouth,
    maxLat: cellLats[rows - 1] + halfLatNorth,
    minLon: cellLons[0] + halfLonWest,
    maxLon: cellLons[cols - 1] + halfLonEast,
  };
}

// total is null when Content-Length is missing (mobile carriers, HTTP/2/3,
// or the streaming function response, whose length is unknown until the
// filter has run). The UI then switches from a determinate bar to an
// indeterminate animation so the user sees progress instead of a stuck 0%
// bar for the whole download.
type ProgressCallback = (received: number, total: number | null) => void;

// Same base-URL convention as src/lib/nowcastLocal.ts: web builds call the
// same-origin endpoint (Vercel serves /api/nowcast in prod; the Vite dev
// proxy routes it to HKO's raw file — dev has no functions — and the client
// parser drops zeros either way); native builds point VITE_API_BASE at the
// deployed site so the Capacitor webview reaches the same function. The
// function's mode=full streams only value>0 rows (the raw file is ~2.7 MB,
// 98.8% zeros) and forwards HKO's Last-Modified for the freshness probe.
const API_BASE = import.meta.env.VITE_API_BASE ?? '';
const NOWCAST_CSV_URL = `${API_BASE}/api/nowcast?mode=full`;

/** Query cache key, hoisted so queryFn's freshness probe can read the
 * previous result through queryClient.getQueryData. */
const NOWCAST_QUERY_KEY = ['hkoGriddedRainfallNowcast'] as const;

const fetchRainfallNowcast = async (
  onProgress?: ProgressCallback,
  externalSignal?: AbortSignal,
): Promise<NowcastResult> => {
  // Stall-aware timeout: the abort fires when NO bytes have arrived for
  // NOWCAST_STALL_TIMEOUT_MS — the timer resets on every chunk, so a
  // healthy-but-slow download runs to completion. The previous fixed 30 s
  // total deadline killed in-progress streams on slow connections, which
  // surfaced as NS_BINDING_ABORTED and then burned a full re-download on
  // React Query's retry (HML-43). The timer also covers the headers wait:
  // no first byte within 10 s means the connection is dead anyway.
  const controller = new AbortController();
  let stallTimerId: ReturnType<typeof setTimeout> | undefined;
  const armStallTimer = () => {
    clearTimeout(stallTimerId);
    stallTimerId = setTimeout(() => {
      controller.abort(new DOMException(
        `Rainfall nowcast stalled: no bytes for ${TIMING.NOWCAST_STALL_TIMEOUT_MS}ms`,
        'TimeoutError'
      ));
    }, TIMING.NOWCAST_STALL_TIMEOUT_MS);
  };
  armStallTimer();

  // Forward React Query's signal so a manual refetch / unmount / cache
  // eviction cancels the in-flight read. Without this, a refetchInterval
  // could overlap a previous 30 s fetch and leak bandwidth for the full
  // timeout window. `detachExternal` returns a cleanup (or null) that
  // finally-block invokes; it captures the listener reference so add +
  // remove see the same function identity.
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
    const response = await fetch(NOWCAST_CSV_URL, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Failed to fetch gridded rainfall nowcast');

    // Parse last-modified header for adaptive refetch scheduling
    const lmHeader = response.headers.get('last-modified');
    const lastModified = lmHeader ? new Date(lmHeader).getTime() : Date.now();

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : null;

    if (response.body) {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // Progress = liveness: restart the stall window on every chunk.
        armStallTimer();
        chunks.push(value);
        received += value.length;
        onProgress?.(received, total);
      }

      // Yield to React so it can render the final progress state
      // before synchronous parsing blocks the main thread.
      await new Promise(resolve => setTimeout(resolve, 0));

      // Concatenate all chunks into one typed array
      const allChunks = new Uint8Array(received);
      let position = 0;
      for (const chunk of chunks) {
        allChunks.set(chunk, position);
        position += chunk.length;
      }

      const csvText = new TextDecoder().decode(allChunks);
      const parsed = parseRainfallCSVText(csvText);
      // Persist the sparse parsed rows for next mount (15-min TTL; ~10×
      // smaller than the raw CSV since 98.8% of rows are 0.00). Deferred to
      // an idle slot so the React commit that releases the map lock isn't
      // blocked. writeNowcastCache is still exported for tests that want
      // immediate persistence.
      scheduleCacheWrite(parsed.rows, parsed.updateTime, lastModified);
      const grid = buildRainGrid(parsed.rows);
      if (!grid) throw new Error('No rain cells in nowcast payload');
      return { grid, updateTime: parsed.updateTime, lastModified };
    }

    // Fallback: no ReadableStream (very old browsers only — HKO always sends
    // one). The stall timer armed before fetch() still covers this await;
    // .text() exposes no chunk boundary, so it cannot be re-armed mid-body —
    // a body slower than one full stall window trips the abort here.
    const csvText = await response.text();
    const parsed = parseRainfallCSVText(csvText);
    scheduleCacheWrite(parsed.rows, parsed.updateTime, lastModified);
    const grid = buildRainGrid(parsed.rows);
    if (!grid) throw new Error('No rain cells in nowcast payload');
    return { grid, updateTime: parsed.updateTime, lastModified };
  } finally {
    clearTimeout(stallTimerId);
    detachExternal?.();
  }
};

/**
 * HEAD-probe the nowcast's Last-Modified without downloading the body.
 * Used before scheduled background refetches: HKO ignores
 * If-Modified-Since/If-None-Match (verified 2026-09-28 — both return 200
 * with the full body), so the only cheap freshness check is a HEAD compare.
 * The probe targets /api/nowcast?mode=full, whose HEAD handler answers from
 * HKO's headers-only response — no body crosses the wire in either hop.
 * Returns null when the header is missing or the probe fails — the caller
 * then falls through to the full GET. A query-cancellation abort propagates
 * so React Query sees the cancellation instead of a pointless full GET.
 *
 * The workbox SW caches only the GET (mode=full entry below); HEAD requests
 * pass straight through to the network. Native builds run no SW at all.
 */
async function fetchNowcastLastModified(signal: AbortSignal): Promise<number | null> {
  // Bound the probe with the same stall budget as the GET: a HEAD that never
  // completes must not wedge queryFn (and isFetching) open indefinitely —
  // the exact HML-43 failure class the GET path was hardened against.
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException('HEAD probe timed out', 'TimeoutError'));
  }, TIMING.NOWCAST_STALL_TIMEOUT_MS);
  const onOuterAbort = () => controller.abort(signal.reason);
  if (signal.aborted) controller.abort(signal.reason);
  else signal.addEventListener('abort', onOuterAbort);
  try {
    const res = await fetch(NOWCAST_CSV_URL, { method: 'HEAD', signal: controller.signal });
    if (!res.ok) return null;
    const lm = res.headers.get('last-modified');
    if (!lm) return null;
    const t = new Date(lm).getTime();
    return Number.isFinite(t) ? t : null;
  } catch (err) {
    // Outer cancellation (query supersede / unmount) must propagate so React
    // Query sees it; our own timeout just means "probe failed" → full GET.
    if (signal.aborted) throw err;
    return null;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onOuterAbort);
  }
}

export default function RainfallMapInner({
  userLocation,
  initialNowcast,
}: {
  userLocation?: UserLocation;
  /** Cached sparse rows from the 15-min localStorage cache. When present, we
   *  build the grid once at mount and hand the result to React Query as
   *  initialData so the first render shows the parsed grid with no network
   *  round-trip and no loading state. Carries the source CSV's Last-Modified
   *  so the first background refetch can HEAD-probe instead of downloading. */
  initialNowcast?: NowcastCacheRead | null;
}) {
  const viewportInit = useRef(false);
  const prevUserLoc = useRef<string | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  // Used only when Content-Length is missing: an animated bar with no fill
  // percentage. Kept separate from downloadProgress so we can render either
  // mode without a sentinel like -1.
  const [bytesReceived, setBytesReceived] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const { basemapIsDark, toggleBasemap } = useBasemapDark();

  // Build the grid from the cached rows once at mount. Memoized on
  // initialNowcast so subsequent renders (and subsequent refetches) don't
  // rebuild. On failure we return null and let the queryFn handle it like a
  // cold start — no special error path needed because the network fetch will
  // overwrite the cache anyway.
  const cachedResult = useMemo<NowcastResult | null>(() => {
    if (!initialNowcast) return null;
    try {
      const grid = buildRainGrid(initialNowcast.rows);
      if (!grid) return null;
      // Carry the real Last-Modified through (unlike the old CSV cache,
      // which couldn't): the background refetch HEAD-probes against it to
      // skip the download while the source file is unchanged.
      return {
        grid,
        updateTime: initialNowcast.updateTime,
        lastModified: initialNowcast.lastModified,
      };
    } catch {
      return null;
    }
  }, [initialNowcast]);

  // Same 1080px breakpoint as the rest of the app (shared refcounted
  // matchMedia listener in useIsMobile).
  const isMobile = useIsMobile();
  // Two levels above the old 6/7 floor: the widest allowed view stops at
  // district scale — zoomed further out the cells smear into a region-wide
  // blob that reads as "raining over everything", the exact misread this
  // map exists to fix.
  const minZoom = isMobile ? 8 : 9;

  const queryClient = useQueryClient();
  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: NOWCAST_QUERY_KEY,
    queryFn: async ({ signal }) => {
      // Don't pre-seed progress: keep showing the spinner until the first
      // chunk actually arrives. Pre-seeding to 0 races with React 18's
      // auto-batching and produces a stuck-at-0% bar in the indeterminate
      // path (no Content-Length → no onProgress ever fires).
      setDownloadProgress(null);
      setBytesReceived(null);
      // Freshness probe: when we already hold data and the server's file
      // hasn't changed since, skip the download entirely (HML-43).
      // Covers both the 15-min background refetch and a cache-hit mount
      // whose localStorage TTL has lapsed. touchNowcastCache restarts the
      // localStorage TTL so the next mount keeps hitting the cache too.
      const prev = queryClient.getQueryData<NowcastResult>(NOWCAST_QUERY_KEY);
      if (prev && prev.lastModified > 0) {
        const remote = await fetchNowcastLastModified(signal);
        if (remote !== null && remote === prev.lastModified) {
          touchNowcastCache();
          return prev;
        }
      }
      return await fetchRainfallNowcast((received, total) => {
        if (total !== null && total > 0) {
          setDownloadProgress(Math.round((received / total) * 100));
          setBytesReceived(null);
        } else {
          setDownloadProgress(null);
          setBytesReceived(received);
        }
      }, signal);
    },
    // 15-min TTL aligned with the localStorage cache. Within this window
    // the cached CSV is served as initialData (see below) and React Query
    // considers it fresh — no fetch on mount, on focus, or on reconnect.
    staleTime: TIMING.NOWCAST_CACHE_TTL_MS,
    refetchInterval: (query) => {
      // Schedule the next refetch for when the cache TTL expires, so the
      // background refresh always lines up with cache invalidation. Uses
      // dataUpdatedAt (set by initialDataUpdatedAt below for cache hits) as
      // the anchor so the cache TTL and the refetch cadence stay in sync.
      // A non-positive value here just means "refetch now" — React Query
      // treats it as 0, which is exactly what we want for an already-
      // expired cache.
      const cachedAt = query.state.dataUpdatedAt;
      if (!cachedAt) return TIMING.NOWCAST_CACHE_TTL_MS;
      return cachedAt + TIMING.NOWCAST_CACHE_TTL_MS - Date.now();
    },
    initialData: cachedResult ?? undefined,
    initialDataUpdatedAt: cachedResult ? Date.now() : 0,
    // One automatic retry on transient failure (cell-edge blip, Vercel edge
    // hiccup). After the retry fails, the query settles into error state
    // and the UI shows the stale-data indicator (previous fetch's grid
    // still on screen) or the full-screen error overlay (no data).
    retry: 1,
    retryDelay: 1000,
  });

  const grid = data?.grid ?? null;
  const stepCount = grid?.stepCount ?? 0;
  const stepTimes = grid?.stepTimes ?? [];
  const updateTime = data?.updateTime || '';
  const dataBounds = grid ? gridBounds(grid) : null;
  const rainfallGeoJson = useMemo(
    () => grid ? rainfallGridToGeoJson(grid, activeStepIndex) : undefined,
    [grid, activeStepIndex],
  );
  const { t } = useLanguage();

  useEffect(() => {
    if (stepCount > 0) setActiveStepIndex(0);
  }, [data, stepCount]);

  useAutoplayStep(isPlaying, stepCount, () => {
    setActiveStepIndex((prevIndex) => (prevIndex + 1) % stepCount);
  });

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const locKey = userLocation ? `${userLocation.latitude},${userLocation.longitude}` : null;
    const userChanged = locKey && locKey !== prevUserLoc.current;

    if (!viewportInit.current || userChanged) {
      if (userLocation) {
      map.setCenter([userLocation.longitude, userLocation.latitude]);
      map.setZoom(12);
        prevUserLoc.current = locKey;
        viewportInit.current = true;
      } else if (dataBounds) {
        map.fitBounds([[dataBounds.minLon, dataBounds.minLat], [dataBounds.maxLon, dataBounds.maxLat]], { padding: 50 });
        viewportInit.current = true;
      } else {
        map.fitBounds([[PRD_BOUNDS.minLon, PRD_BOUNDS.minLat], [PRD_BOUNDS.maxLon, PRD_BOUNDS.maxLat]], { padding: 50 });
        viewportInit.current = true;
      }
    }
  }, [userLocation, dataBounds]);

  // Slow-network chip: when the initial fetch takes >10 s, surface a
  // "Slow connection" message above the determinate bar so the user knows
  // the spinner isn't stuck. Cleared when isLoading flips false (success
  // OR failure → error overlay / stale indicator takes over).
  const isSlow = useSlowFlag(isLoading);

  // Lock the map while rainfall grid data is still being fetched; unlock once
  // the CSV is parsed and the cells are on screen. This prevents the user from
  // panning/zooming a blank basemap that would mislead them about coverage.
  const { mapRef, handleMapRef } = useMapLockRef(!!data && !isLoading);

  // Manual step selection (slider or label click) pauses autoplay, matching
  // the MSC map.
  const selectStep = (index: number) => {
    setActiveStepIndex(index);
    setIsPlaying(false);
  };

  return (
    <div className="absolute inset-0 flex flex-col">
      {!isLoading && stepCount > 0 && (
        <NowcastTimelineBar
          stepTimes={stepTimes}
          activeStepIndex={activeStepIndex}
          isPlaying={isPlaying}
          onTogglePlay={() => setIsPlaying(!isPlaying)}
          onSelectStep={selectStep}
        />
      )}

      {/* Hidden test affordance: lets unit tests verify the grid shape flowing
          into the canvas layer without mounting a real MapLibre map. The shape
          here is the source of truth for the layer's data. */}
      {grid && (
        <div
          data-testid="rain-grid"
          data-rows={grid.rows}
          data-cols={grid.cols}
          data-step-count={grid.stepCount}
          data-active-step={activeStepIndex}
          data-min-lat={grid.cellLats[0]}
          data-min-lon={grid.cellLons[0]}
          data-cell-dlat={grid.cellLats.length >= 2 ? grid.cellLats[1] - grid.cellLats[0] : 0.018}
          data-cell-dlon={grid.cellLons.length >= 2 ? grid.cellLons[1] - grid.cellLons[0] : 0.0195}
          style={{ display: 'none' }}
        />
      )}

      {/* flex-1 = fills the remaining height after step controls; the parent
          uses absolute inset-0 to anchor to the outer rain-map-area in
          RainfallMap.tsx, which has explicit height (h-[min(70vh,800px)]
          min-h-[400px]). no-swipe yields touch events to MapLibre. */}
      <div className="rainfall-map-area no-swipe relative flex-1 min-h-0 w-full bg-muted/20">
        <MapTopRightControls
          time={updateTime ? formatString(t('nowcast.updated'), updateTime) : undefined}
          basemapIsDark={basemapIsDark}
          onToggleBasemap={toggleBasemap}
          onRefresh={() => refetch()}
          refreshDisabled={isFetching}
          refreshSpinning={isFetching}
        />
        {/* First load: spinner → determinate bar OR indeterminate animation */}
        {isLoading && (
          <div className="absolute inset-0 z-1001 flex items-center justify-center bg-background/50 backdrop-blur-xs">
            {isSlow && <SlowChip />}
            {downloadProgress !== null ? (
              // Determinate: Content-Length was sent; we can show a real %.
              <div className="w-80 flex flex-col gap-1.5">
                <div className="flex justify-between text-sm">
                  <span>{t('nowcast.downloading')}</span>
                  <span className="tabular-nums">{downloadProgress}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              </div>
            ) : bytesReceived !== null ? (
              // Indeterminate: Content-Length was missing (mobile/HTTP-2 edge).
              // Show a sliding stripe and the byte count so the user sees
              // the download is actually progressing.
              <div className="w-80 flex flex-col gap-1.5">
                <div className="flex justify-between text-sm">
                  <span>{t('nowcast.downloading')}</span>
                  <span className="tabular-nums">{(bytesReceived / 1024).toFixed(0)} KB</span>
                </div>
                <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                  <div className="progress-indeterminate rounded-full" />
                </div>
              </div>
            ) : (
              // Before the first chunk arrives.
              <RefreshCw className="w-8 h-8 animate-spin text-primary" />
            )}
          </div>
        )}

        {/* Background refetch: thin bar at top of map */}
        {!isLoading && isFetching && (downloadProgress !== null || bytesReceived !== null) && (
          <div className="absolute top-0 left-0 right-0 z-10 h-1 bg-muted/60 overflow-hidden">
            {downloadProgress !== null ? (
              <div
                className="h-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${downloadProgress}%` }}
              />
            ) : (
              <div className="progress-indeterminate h-full" />
            )}
          </div>
        )}

        {/* Full-screen error overlay ONLY when we have no data to show
            (initial fetch failed and there's no cache fallback). When we
            already have a rendered grid — i.e. the background refetch
            failed — we render a small pill instead so the map stays
            interactive instead of being trapped behind a blocking modal. */}
        {error && !data && (
          <MapErrorOverlay onRetry={() => refetch()} />
        )}

        {/* Stale-data indicator: previous fetch failed, current data is
            still on screen. */}
        {error && data && (
          <StaleErrorPill
            onRetry={() => refetch()}
            retryDisabled={isFetching}
            retrySpinning={isFetching}
          />
        )}

        <MapLibreMap
          center={[114.10, 22.40]}
          zoom={12}
          minZoom={minZoom}
          maxZoom={17}
          dark={basemapIsDark}
          interactive={!!data && !isLoading}
          ariaLabel={t('nowcast.mapLabel')}
          marker={userLocation ? [userLocation.longitude, userLocation.latitude] : undefined}
          rainfall={rainfallGeoJson}
          onMap={handleMapRef}
        />

        {!isLoading && (
          <MapLegend
            title={t('nowcast.legend')}
            bands={RAINFALL_BANDS.map(({ color, label }) => ({ color, label }))}
          />
        )}
      </div>
    </div>
  );
}
