import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Map } from 'maplibre-gl';
import { AlertCircle, RefreshCw, Play, Pause, Layers } from 'lucide-react';
import { useLanguage, formatString } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { PRD_BOUNDS } from '@/lib/hko-weather';
import { TIMING } from '@/lib/constants';
import { parseRainfallCSVText, buildRainGrid, type RainGrid } from '@/lib/rainfallGrid';
import { RAINFALL_BANDS } from '@/lib/rainfallBands';
import { scheduleCacheWrite } from '@/lib/nowcastCache';
import { isNativePlatform, nativeHttpGetText } from '@/lib/native-http';
import { MapLibreMap } from './MapLibreMap';
import { rainfallGridToGeoJson } from '@/lib/rainfallGeoJson';

interface UserLocation {
  latitude: number;
  longitude: number;
}

interface NowcastResult {
  grid: RainGrid;
  updateTime: string;
  lastModified: number;
}

// Two basemap styles: a light/clean Carto Positron tile and a dark Carto
// Dark Matter tile. The map theme defaults to the app theme (synced via
// useEffect on resolvedTheme) but the switch button lets the user flip
// it independently. Tile keys are stable across the theme switch so the
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
// or Vercel's edge sometimes strip the header). The UI then switches from a
// determinate bar to an indeterminate animation so the user sees progress
// instead of a stuck 0% bar for the entire 2.7 MB download.
type ProgressCallback = (received: number, total: number | null) => void;

// HKO sends no CORS header on the CSV, so web loads fetch it through the
// same-origin proxy (Vite dev proxy / Vercel rewrite). The native WebView
// has no rewrite layer and no service worker to cache with, so it fetches
// HKO directly over the native HTTP stack (no CORS there) — see
// native-http.ts for the trade-offs that path accepts.
const NOWCAST_PROXY_PATH = '/hko-data/F3/Gridded_rainfall_nowcast.csv';
const NOWCAST_ORIGIN_URL =
  'https://data.weather.gov.hk/weatherAPI/hko_data/F3/Gridded_rainfall_nowcast.csv';

const fetchRainfallNowcast = async (
  onProgress?: ProgressCallback,
  externalSignal?: AbortSignal,
): Promise<NowcastResult> => {
  // Native path: one-shot native GET, then the same parse + cache flow as
  // the streamed web path. No progress events (CapacitorHttp has no
  // streaming) and no signal to forward — the timeout lives inside
  // nativeHttpGetText.
  if (isNativePlatform()) {
    const { text, lastModified: lm } = await nativeHttpGetText(
      NOWCAST_ORIGIN_URL,
      TIMING.NOWCAST_TIMEOUT_MS,
    );
    const parsed = parseRainfallCSVText(text);
    scheduleCacheWrite(text, parsed.updateTime, lm);
    const grid = buildRainGrid(parsed.rows);
    if (!grid) throw new Error('No rain cells in nowcast payload');
    return { grid, updateTime: parsed.updateTime, lastModified: lm };
  }

  // Manage the timeout here (not via fetchWithTimeout) so the abort stays
  // armed through the body-read loop — headers can arrive in <1s on a warm
  // connection while the body stream still takes 20+ s on slow mobile.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException(
      `Rainfall nowcast fetch timed out after ${TIMING.NOWCAST_TIMEOUT_MS}ms`,
      'TimeoutError'
    ));
  }, TIMING.NOWCAST_TIMEOUT_MS);

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
    const response = await fetch(NOWCAST_PROXY_PATH, {
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
      // Persist for next mount (15-min TTL). Defer the LZString compression
      // + localStorage write to an idle slot so the React commit that
      // releases the map lock isn't blocked by the ~300-800 ms compress
      // cost on low-end mobile. writeNowcastCache is still exported for
      // tests that want immediate persistence.
      scheduleCacheWrite(csvText, parsed.updateTime, lastModified);
      const grid = buildRainGrid(parsed.rows);
      if (!grid) throw new Error('No rain cells in nowcast payload');
      return { grid, updateTime: parsed.updateTime, lastModified };
    }

    // Fallback: no ReadableStream (very old browsers only — HKO always sends one)
    const csvText = await response.text();
    const parsed = parseRainfallCSVText(csvText);
    scheduleCacheWrite(csvText, parsed.updateTime, lastModified);
    const grid = buildRainGrid(parsed.rows);
    if (!grid) throw new Error('No rain cells in nowcast payload');
    return { grid, updateTime: parsed.updateTime, lastModified };
  } finally {
    clearTimeout(timeoutId);
    detachExternal?.();
  }
};

export default function RainfallMapInner({
  userLocation,
  initialCsv,
}: {
  userLocation?: UserLocation;
  /** Cached CSV text from the 15-min localStorage cache. When present, we
   *  parse it once at mount and hand the result to React Query as
   *  initialData so the first render shows the parsed grid with no network
   *  round-trip and no loading state. */
  initialCsv?: string | null;
}) {
  const mapRef = useRef<Map | null>(null);
  const viewportInit = useRef(false);
  const prevUserLoc = useRef<string | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  // Used only when Content-Length is missing: an animated bar with no fill
  // percentage. Kept separate from downloadProgress so we can render either
  // mode without a sentinel like -1.
  const [bytesReceived, setBytesReceived] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  // Map basemap is a light/dark toggle that defaults to the app theme. The
  // switch button flips it independently; the effect below re-aligns it with
  // the app theme whenever the theme changes.
  const [basemapIsDark, setBasemapIsDark] = useState(false);

  // Parse the cached CSV once at mount. Memoized on initialCsv so subsequent
  // renders (and subsequent refetches) don't re-parse. On parse failure we
  // return null and let the queryFn handle it like a cold start — no special
  // error path needed because the network fetch will overwrite the cache
  // anyway.
  const cachedResult = useMemo<NowcastResult | null>(() => {
    if (!initialCsv) return null;
    try {
      const parsed = parseRainfallCSVText(initialCsv);
      const grid = buildRainGrid(parsed.rows);
      if (!grid) return null;
      // lastModified is 0 on the cache-hit path: we don't carry the HTTP
      // Last-Modified header through, and the field is unused now that
      // refetchInterval anchors on dataUpdatedAt.
      return { grid, updateTime: parsed.updateTime, lastModified: 0 };
    } catch {
      return null;
    }
  }, [initialCsv]);
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    setBasemapIsDark(resolvedTheme === 'dark');
  }, [resolvedTheme]);

  // Same 1080px breakpoint as the rest of the app (shared refcounted
  // matchMedia listener in useIsMobile).
  const isMobile = useIsMobile();
  const minZoom = isMobile ? 6 : 7;

  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['hkoGriddedRainfallNowcast'],
    queryFn: async ({ signal }) => {
      // Don't pre-seed progress: keep showing the spinner until the first
      // chunk actually arrives. Pre-seeding to 0 races with React 18's
      // auto-batching and produces a stuck-at-0% bar in the indeterminate
      // path (no Content-Length → no onProgress ever fires).
      setDownloadProgress(null);
      setBytesReceived(null);
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

  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;
    if (isPlaying && stepCount > 0) {
      interval = setInterval(() => {
        setActiveStepIndex((prevIndex) => (prevIndex + 1) % stepCount);
      }, TIMING.RAINFALL_AUTOPLAY_MS);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isPlaying, stepCount]);

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
  const [isSlow, setIsSlow] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setIsSlow(false);
      return;
    }
    const id = setTimeout(() => setIsSlow(true), 10_000);
    return () => clearTimeout(id);
  }, [isLoading]);

  // Lock the map while rainfall grid data is still being fetched; unlock once
  // the CSV is parsed and the cells are on screen. This prevents the user from
  // panning/zooming a blank basemap that would mislead them about coverage.
  //
  // Invoked from the MapLibre map callback below (NOT a useEffect). With
  // initialData, [data, isLoading] don't change after mount, so the only way
  // to apply the lock state on the cache path is via the ref callback —
  // the map callback fires after our useEffect would have run with mapRef.current = null.
  //
  // Subsequent state changes are handled by React's ref detach/reattach:
  // when applyMapLockState's identity changes (deps [data, isLoading]),
  // handleMapRef gets a new identity, React calls the old ref with null and
  // the new ref with the current map, which invokes the new applyMapLockState.
  const applyMapLockState = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const ready = !!data && !isLoading;
    if (ready) {
      map.dragPan.enable(); map.scrollZoom.enable(); map.doubleClickZoom.enable(); map.boxZoom.enable(); map.keyboard.enable();
    } else {
      map.dragPan.disable(); map.scrollZoom.disable(); map.doubleClickZoom.disable(); map.boxZoom.disable(); map.keyboard.disable();
    }
  }, [data, isLoading]);

  // Tracks the ResizeObserver attached to the map's container so we can
  // disconnect it when the ref callback re-fires (identity change on
  // data/isLoading) or the map is torn down — without this, a
  // detach/reattach cycle would leak observers onto old DOM nodes.
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // useCallback so the ref identity tracks applyMapLockState's identity;
  // React's detach/reattach on identity change fires the new closure.
  //
  // Also closes the "blank map on mobile" race: MapLibre's constructor
  // reads the container's bounding rect synchronously, so a map mounted
  // against a 0x0 container (Swiper slide transition, iOS Safari URL-bar
  // mid-transition) is built with a 0x0 viewport that never self-repairs.
  // invalidateSize() on the next frame re-reads the settled size; the
  // ResizeObserver covers in-session changes (URL bar toggle, orientation,
  // slide re-entry).
  const handleMapRef = useCallback(
    (map: Map | null) => {
      mapRef.current = map;

      if (map) {
        applyMapLockState();
        // RAF so the container has its settled size (mount-time race).
        requestAnimationFrame(() => {
        map.resize();
        });
        // Replace any prior observer from a previous identity of this
        // ref callback — disconnects the old one, observes the new map.
        resizeObserverRef.current?.disconnect();
        const observer = new ResizeObserver(() => map.resize());
        observer.observe(map.getContainer());
        resizeObserverRef.current = observer;
      } else {
        // Unmount or identity-change detach. Disconnect so the observer
        // doesn't keep the (now-detached) container DOM node + closure
        // pinned in memory — without this, every remount leaks an
        // observer onto a dead node.
        resizeObserverRef.current?.disconnect();
        resizeObserverRef.current = null;
      }
    },
    [applyMapLockState],
  );

  return (
    <div className="absolute inset-0 flex flex-col">
      {!isLoading && stepCount > 0 && (
        <div className="px-6 py-5 bg-background/50 border-b border-border/50 flex flex-row items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-2.5 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors shadow-sm"
              title={isPlaying ? 'Pause' : 'Play timeline'}
              aria-label={isPlaying ? t('nowcast.pause') : t('nowcast.play')}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
            </button>
            <div className="flex flex-col min-w-[80px]">
              <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">{t('nowcast.forecastStep')}</span>
              <span className="text-lg font-bold text-foreground">{stepTimes[activeStepIndex]}</span>
            </div>
          </div>

          <div className="flex-1 min-w-0 w-full flex flex-col gap-2">
            <input
              type="range"
              min={0}
              max={stepCount - 1}
              value={activeStepIndex}
              onChange={(e) => {
                setActiveStepIndex(parseInt(e.target.value));
                setIsPlaying(false);
              }}
              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={t('nowcast.slider')}
            />
            {/* Step labels: many GeoMet/HKO steps overflow a 375-440 px card,
                so the row scrolls horizontally (hidden scrollbar) instead of
                clipping against the card's overflow-x:hidden. w-max keeps the
                flex content sized to the buttons; min-w-full + justify-between
                spread a small step count across the full width. */}
            <div className="overflow-x-auto text-xs font-semibold text-muted-foreground -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex w-max min-w-full items-center justify-between gap-x-1">
              {stepTimes.map((time, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setActiveStepIndex(index);
                    setIsPlaying(false);
                  }}
                  aria-current={index === activeStepIndex ? 'true' : undefined}
                  className={`px-2 py-1 whitespace-nowrap min-h-[24px] rounded hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    index === activeStepIndex ? 'text-primary font-bold' : ''
                  }`}
                >
                  {time}
                </button>
              ))}
              </div>
            </div>
          </div>
        </div>
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
        {/* Top-right control cluster: updated time + basemap switcher + refresh.
            Bottom-left is reserved for the swiper pagination dots on mobile, so
            these buttons live at the top-right where nothing else competes.
            z-[600] = above the map canvas, below dialog content. */}
        <div className="absolute top-2 right-2 z-[600] flex items-center gap-2 text-xs text-muted-foreground bg-background/90 backdrop-blur-sm p-1.5 rounded-md border border-border/50 shadow-sm">
          {updateTime && (
            <span className="px-1 tabular-nums">{formatString(t('nowcast.updated'), updateTime)}</span>
          )}
          <button
            onClick={() => setBasemapIsDark(v => !v)}
            // WCAG 2.5.5 Level AAA: 44×44 CSS pixel tap target. min-h/-w
            // overrides the p-1 default so the small icon stays inside a
            // phone-sized hit zone. inline-flex + items-center +
            // justify-center centers the icon in the 44×44 box.
            className="inline-flex items-center justify-center min-h-[2.75rem] min-w-[2.75rem] p-1 hover:bg-muted/50 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={formatString(t('nowcast.switchBasemap'), t(basemapIsDark ? 'nowcast.basemapDark' : 'nowcast.basemapLight'))}
          >
            <Layers className="w-4 h-4" />
          </button>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center justify-center min-h-[2.75rem] min-w-[2.75rem] p-1 hover:bg-muted/50 rounded transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            disabled={isFetching}
            aria-label={t('nowcast.refreshNowcast')}
            title={t('nowcast.refreshNowcast')}
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-primary' : ''}`} />
          </button>
        </div>
        {/* First load: spinner → determinate bar OR indeterminate animation */}
        {isLoading && (
          <div className="absolute inset-0 z-[1001] flex items-center justify-center bg-background/50 backdrop-blur-sm">
            {isSlow && (
              // Slow-network chip above the progress bar. Surfaces after
              // 10 s of isLoading so the spinner doesn't read as stuck on
              // flaky 3G/4G. Cleared the moment isLoading flips false.
              // aria-live="polite" announces the state change to screen
              // readers without interrupting the loading announcement.
              <div
                role="status"
                aria-live="polite"
                className="absolute top-3 left-1/2 -translate-x-1/2 z-[1002] flex items-center gap-2 text-xs bg-background/95 border border-border/60 rounded-full px-3 py-1.5 shadow-sm backdrop-blur-sm"
              >
                <RefreshCw className="w-3 h-3 animate-spin text-primary" />
                <span className="text-muted-foreground">{t('nowcast.loadingSlow')}</span>
              </div>
            )}
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
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm p-6 text-center">
            <AlertCircle className="w-10 h-10 text-destructive mb-2" />
            <p className="text-lg font-medium text-foreground mb-1">{t('nowcast.loadFailed')}</p>
            <p className="text-muted-foreground mb-4">{t('nowcast.error')}</p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              {t('nowcast.tryAgain')}
            </button>
          </div>
        )}

        {/* Stale-data indicator: previous fetch failed, current data is
            still on screen. Pinned top-left below the zoom control so it
            doesn't fight with the basemap/refresh cluster at top-right.
            z-[600] = above the MapLibre canvas, below dialog content. */}
        {error && data && (
          <div
            role="status"
            aria-live="polite"
            className="absolute top-12 left-2 z-[600] flex items-center gap-2 max-w-[min(90%,360px)] text-xs bg-destructive/10 text-destructive border border-destructive/30 rounded-md px-2.5 py-1.5 backdrop-blur-sm shadow-sm"
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <div className="flex flex-col leading-tight">
              <span className="font-semibold">{t('nowcast.staleTitle')}</span>
              <span className="text-destructive/80">{t('nowcast.staleDesc')}</span>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="ml-1 inline-flex items-center justify-center min-h-[2rem] min-w-[2rem] p-1 rounded hover:bg-destructive/20 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={t('nowcast.tryAgain')}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
        )}

        <MapLibreMap
          center={[114.10, 22.40]}
          zoom={9}
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
          <div className="absolute bottom-4 right-4 z-[400] bg-background/90 backdrop-blur-sm p-3 rounded-lg border border-border shadow-lg text-xs">
            <div className="font-semibold mb-2">{t('nowcast.legend')}</div>
            <div className="flex flex-col gap-1.5">
              {RAINFALL_BANDS.map(({ color, label }) => (
                <div key={color} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }}></div>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
