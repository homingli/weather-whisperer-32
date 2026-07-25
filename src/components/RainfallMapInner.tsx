import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, Marker, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import { AlertCircle, RefreshCw, Play, Pause, Layers } from 'lucide-react';
import { useLanguage, formatString } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { PRD_BOUNDS } from '@/lib/hko-weather';
import { TIMING } from '@/lib/constants';
import { parseRainfallCSVText, buildRainGrid, type RainGrid } from '@/lib/rainfallGrid';
import { RAINFALL_BANDS } from '@/lib/rainfallBands';
import { writeNowcastCache } from '@/lib/nowcastCache';
import { RainfallCellsLayer } from './RainfallCellsLayer';

interface UserLocation {
  latitude: number;
  longitude: number;
}

const locationIcon = new L.Icon({
  iconUrl: '/icons/marker-icon-2x-blue.png',
  shadowUrl: '/icons/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  shadowSize: [41, 41],
});

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
const TILE_URLS = {
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png',
};
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

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

const fetchRainfallNowcast = async (onProgress?: ProgressCallback): Promise<NowcastResult> => {
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

  try {
    const response = await fetch('/hko-data/F3/Gridded_rainfall_nowcast.csv', {
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
      // Persist for next mount (15-min TTL). Non-blocking on quota errors.
      writeNowcastCache(csvText, parsed.updateTime, lastModified);
      return { grid: buildRainGrid(parsed.rows)!, updateTime: parsed.updateTime, lastModified };
    }

    // Fallback: no ReadableStream (very old browsers only — HKO always sends one)
    const csvText = await response.text();
    const parsed = parseRainfallCSVText(csvText);
    writeNowcastCache(csvText, parsed.updateTime, lastModified);
    return { grid: buildRainGrid(parsed.rows)!, updateTime: parsed.updateTime, lastModified };
  } finally {
    clearTimeout(timeoutId);
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
  const mapRef = useRef<L.Map | null>(null);
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
      return { grid, updateTime: parsed.updateTime, lastModified: Date.now() };
    } catch {
      return null;
    }
  }, [initialCsv]);
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    setBasemapIsDark(resolvedTheme === 'dark');
  }, [resolvedTheme]);

  // Zoom bounds differ by viewport: mobile keeps minZoom 8 (slightly wider
  // context), desktop tightens to 9 (less empty ocean). maxZoom 17 is shared.
  // Same 1080px breakpoint as the rest of the app.
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia('(max-width: 1080px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1080px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const minZoom = isMobile ? 8 : 9;

  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['hkoGriddedRainfallNowcast'],
    queryFn: async () => {
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
      });
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
      const cachedAt = query.state.dataUpdatedAt;
      if (!cachedAt) return TIMING.NOWCAST_CACHE_TTL_MS;
      const timeUntilExpiry = cachedAt + TIMING.NOWCAST_CACHE_TTL_MS - Date.now();
      // Floor at 60 s so a clock skew or already-expired cache doesn't
      // produce a 0 / negative interval that would hot-loop the fetcher.
      return Math.max(timeUntilExpiry, 60_000);
    },
    initialData: cachedResult ?? undefined,
    initialDataUpdatedAt: cachedResult ? Date.now() : 0,
    retry: 0,
  });

  const grid = data?.grid ?? null;
  const stepCount = grid?.stepCount ?? 0;
  const stepTimes = grid?.stepTimes ?? [];
  const updateTime = data?.updateTime || '';
  const dataBounds = grid ? gridBounds(grid) : null;
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
        map.setView([userLocation.latitude, userLocation.longitude], 12, { animate: true });
        prevUserLoc.current = locKey;
        viewportInit.current = true;
      } else if (dataBounds) {
        map.fitBounds(
          [[dataBounds.minLat, dataBounds.minLon], [dataBounds.maxLat, dataBounds.maxLon]],
          { padding: [50, 50] }
        );
        viewportInit.current = true;
      } else {
        map.fitBounds(
          [[PRD_BOUNDS.minLat, PRD_BOUNDS.minLon], [PRD_BOUNDS.maxLat, PRD_BOUNDS.maxLon]],
          { padding: [50, 50] }
        );
        viewportInit.current = true;
      }
    }
  }, [userLocation, dataBounds]);

  // Lock the map while rainfall grid data is still being fetched; unlock once
  // the CSV is parsed and the cells are on screen. This prevents the user from
  // panning/zooming a blank basemap that would mislead them about coverage.
  //
  // Extracted into a helper because the useEffect below AND the MapContainer
  // ref callback (further down) both need to apply the same state. With
  // initialData, [data, isLoading] don't change after mount so the useEffect
  // only ever runs once — and at that moment react-leaflet hasn't set our ref
  // yet (useImperativeHandle fires in a later commit cycle). Without the ref
  // callback the cache path would leave the map permanently disabled.
  //
  // useCallback keeps the reference stable across renders so the useEffect
  // doesn't fire every render. Deps are [data, isLoading] so the effect runs
  // exactly when the lock state should change.
  const applyMapLockState = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const ready = !!data && !isLoading;
    if (ready) {
      map.dragging.enable();
      map.scrollWheelZoom.enable();
      map.doubleClickZoom.enable();
      map.touchZoom.enable();
      map.boxZoom.enable();
      map.keyboard.enable();
    } else {
      map.dragging.disable();
      map.scrollWheelZoom.disable();
      map.doubleClickZoom.disable();
      map.touchZoom.disable();
      map.boxZoom.disable();
      map.keyboard.disable();
    }
  }, [data, isLoading]);

  useEffect(() => {
    applyMapLockState();
  }, [applyMapLockState]);

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
              <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Forecast Step</span>
              <span className="text-lg font-bold text-foreground">{stepTimes[activeStepIndex]}</span>
            </div>
          </div>

          <div className="flex-1 w-full flex flex-col gap-2">
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
            <div className="flex justify-between text-xs font-semibold text-muted-foreground px-1">
              {stepTimes.map((time, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setActiveStepIndex(index);
                    setIsPlaying(false);
                  }}
                  aria-current={index === activeStepIndex ? 'true' : undefined}
                  className={`px-2 py-1 min-h-[24px] rounded hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    index === activeStepIndex ? 'text-primary font-bold' : ''
                  }`}
                >
                  {time}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Hidden test affordance: lets unit tests verify the grid shape flowing
          into the canvas layer without mounting a real Leaflet map. The shape
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
          min-h-[400px]). no-swipe yields touch events to Leaflet. */}
      <div className="rainfall-map-area no-swipe relative flex-1 min-h-0 w-full bg-muted/20">
        {/* Top-right control cluster: updated time + basemap switcher + refresh.
            Bottom-left is reserved for the swiper pagination dots on mobile, so
            these buttons live at the top-right where nothing else competes.
            z-[600] = above the leaflet pane (400), below dialog content. */}
        <div className="absolute top-2 right-2 z-[600] flex items-center gap-2 text-xs text-muted-foreground bg-background/90 backdrop-blur-sm p-1.5 rounded-md border border-border/50 shadow-sm">
          {updateTime && (
            <span className="px-1 tabular-nums">{formatString(t('nowcast.updated'), updateTime)}</span>
          )}
          <button
            onClick={() => setBasemapIsDark(v => !v)}
            className="p-1 hover:bg-muted/50 rounded transition-colors"
            aria-label={`Switch basemap (current: ${basemapIsDark ? 'dark' : 'light'})`}
          >
            <Layers className="w-4 h-4" />
          </button>
          <button
            onClick={() => refetch()}
            className="p-1 hover:bg-muted/50 rounded transition-colors disabled:opacity-50"
            disabled={isFetching}
            title="Refresh gridded nowcast"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-primary' : ''}`} />
          </button>
        </div>
        {/* First load: spinner → determinate bar OR indeterminate animation */}
        {isLoading && (
          <div className="absolute inset-0 z-[1001] flex items-center justify-center bg-background/50 backdrop-blur-sm">
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

        {error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm p-6 text-center">
            <AlertCircle className="w-10 h-10 text-destructive mb-2" />
            <p className="text-lg font-medium text-foreground mb-1">Failed to load data</p>
            <p className="text-muted-foreground mb-4">{t('nowcast.error')}</p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        <MapContainer
          center={[22.40, 114.10]}
          zoom={9}
          minZoom={minZoom}
          maxZoom={17}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          dragging={false}
          zoomControl={false}
          // preferCanvas routes all L.Path instances (Rectangles, Polygons)
          // through L.canvas() instead of L.svg(). The canvas renderer
          // handles zoom animation natively via its own zoom-animated
          // container, which scales smoothly with the basemap. With svg()
          // every path becomes a DOM element and the 121×121 grid balloons
          // past React's reconciliation budget.
          preferCanvas={true}
          className="w-full h-full"
          // Callback ref (not the useRef object) so we can apply the lock
          // state the moment react-leaflet's useImperativeHandle lands the
          // map instance — fires after our lock useEffect runs and handles
          // the initialData case where [data, isLoading] never change.
          ref={(map) => {
            mapRef.current = map;
            if (map) applyMapLockState();
          }}
          aria-label={t('nowcast.mapLabel')}
          role="application"
        >
          <ZoomControl position="topleft" />
          <TileLayer
            key={basemapIsDark ? 'dark' : 'light'}
            attribution={TILE_ATTRIBUTION}
            url={basemapIsDark ? TILE_URLS.dark : TILE_URLS.light}
          />

          {grid && (
            <RainfallCellsLayer grid={grid} activeStep={activeStepIndex} />
          )}

          {userLocation && (
            <Marker
              position={[userLocation.latitude, userLocation.longitude]}
              icon={locationIcon}
              zIndexOffset={1000}
            />
          )}
        </MapContainer>

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
