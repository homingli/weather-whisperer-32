import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Map } from 'maplibre-gl';
import { AlertCircle, RefreshCw, Play, Pause, Layers, CloudRain } from 'lucide-react';
import { useLanguage, formatString } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { MSC, TIMING, VANCOUVER_BBOX, VANCOUVER_CENTER } from '@/lib/constants';
import { buildMscStepTimes, formatStepTime, formatObservationTime, vancouverTimeZoneAbbr, buildProbeUrl } from '@/lib/msc-wms';
import { markMscMapMounted } from '@/lib/msc-prefetch';
import { logWarn } from '@/lib/log';
import { MapLibreMap } from './MapLibreMap';

interface UserLocation {
  latitude: number;
  longitude: number;
}


// HRDPS run cycle length and the boundary offset for the run-refresh timer
// (selection flips at cycle start + publish lag, every 6h).
const SIX_HOURS_MS = 6 * 3600_000;
const PUBLISH_LAG_MS = MSC.RUN_PUBLISH_LAG_HOURS * 3600_000;

// GeoMet's TotalPrecipIntensityIndex_Dis discrete classes, verified from the
// GetLegendGraphic image and live tiles (2026-08-07): green = low, yellow =
// moderate, orange = high. Rendered as a compact legend instead of the tall
// 217×482 legend graphic (MapServer can't scale it).
const MSC_INTENSITY_BANDS = [
  { color: '#2CE500', labelKey: 'msc.intensityLow' },
  { color: '#FEFE00', labelKey: 'msc.intensityModerate' },
  { color: '#FE8000', labelKey: 'msc.intensityHigh' },
] as const;

/**
 * Probe whether any precipitation is present in the Vancouver bbox at the
 * given step. GeoMet renders transparent pixels where there is no rain, so a
 * fully transparent probe tile means "no precipitation in forecast". Returns
 * true (rain), false (no rain), or null when the probe can't be evaluated
 * (network error, canvas unavailable) — callers should treat null as unknown.
 *
 * The probe URL comes from the shared `buildProbeUrl` (also used by the idle
 * prefetch in `msc-prefetch`), so a warmed HTTP cache serves the map's probe
 * without hitting the network.
 */
async function probeStepHasRain(stepIso: string): Promise<boolean | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('probe tile failed to load'));
      img.src = buildProbeUrl(stepIso);
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.width || 256;
    canvas.height = img.height || 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true; // any non-transparent pixel = rain present
    }
    return false;
  } catch (err) {
    logWarn('[msc] precipitation probe failed', err);
    return null;
  }
}

export default function MSCRainfallMapInner({
  userLocation,
}: {
  userLocation?: UserLocation;
}) {
  const mapRef = useRef<Map | null>(null);
  const viewportInit = useRef(false);
  const prevUserLoc = useRef<string | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [basemapIsDark, setBasemapIsDark] = useState(false);
  // Tile-layer state: first-load spinner, slow-network chip, first-load
  // failure (full error overlay), background step-switch failure (stale pill).
  const [tileLoading, setTileLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [staleError, setStaleError] = useState(false);
  // Bump to remount the WMS layer and force a tile refetch (retry).
  const [retryNonce, setRetryNonce] = useState(0);
  // No-precipitation probe result: true = rain found in any step, false = all
  // steps dry (chip shown), null = probe inconclusive (no chip). See the
  // effect below (needs `steps`, so it lives after the run/step derivation).
  const [hasRain, setHasRain] = useState<boolean | null>(null);

  // Tell the prefetch module the map is live: a pending idle warm-up must
  // not duplicate the probe fetches the map is about to make itself.
  useEffect(() => {
    markMscMapMounted();
  }, []);

  // Steps/run are derived from the UTC clock and kept in state (not memoized)
  // so the map can refresh to the newest HRDPS run: the refresh button
  // recomputes, and a timer fires at the next publishability boundary (every
  // 6h at cycle start + RUN_PUBLISH_LAG_HOURS) to auto-advance — fixing
  // review issue 4 (steps frozen at mount otherwise keep a stale run on
  // screen for hours). The analysis time (run start) is shown in the control
  // bar (FR-010).
  const [runInfo, setRunInfo] = useState(() => buildMscStepTimes(new Date()));
  const { runStart, steps } = runInfo;
  const stepCount = steps.length;
  const stepTimes = useMemo(() => steps.map(formatStepTime), [steps]);
  const observationTime = useMemo(() => formatObservationTime(runStart.toISOString()), [runStart]);
  const tzAbbr = useMemo(() => vancouverTimeZoneAbbr(runStart.toISOString()), [runStart]);

  // Recompute the run when the next HRDPS cycle becomes publishable. The
  // selection flips at (cycle start + publish lag) every 6h; the epoch is
  // 00:00Z, so `now % 6h` is the elapsed time into the current cycle and the
  // boundary formula below is UTC-aligned. Rescheduled whenever the run
  // changes (each recompute moves the timer to the following boundary).
  useEffect(() => {
    const now = Date.now();
    const cycleStart = now - (now % SIX_HOURS_MS);
    const boundary = now < cycleStart + PUBLISH_LAG_MS ? cycleStart + PUBLISH_LAG_MS : cycleStart + SIX_HOURS_MS + PUBLISH_LAG_MS;
    const id = setTimeout(() => {
      setRunInfo(buildMscStepTimes(new Date()));
      setActiveStepIndex(0);
    }, boundary - now);
    return () => clearTimeout(id);
    // runStart in deps: re-schedule the timer whenever the run advances.
  }, [runStart]);

  // Shared refresh action: recompute the latest run, reset the step, and
  // remount the WMS layer to refetch tiles for the new run's active step.
  const handleRefresh = useCallback(() => {
    setRunInfo(buildMscStepTimes(new Date()));
    setActiveStepIndex(0);
    setRetryNonce((n) => n + 1);
    setStaleError(false);
    setTileError(false);
  }, []);

  // No-precipitation probe: one bbox GetMap per step, run once the map has
  // rendered. The chip only appears when EVERY step probed cleanly and found
  // no rain — a single dry early step must not claim a dry forecast (review
  // issue 2). Non-blocking; a failed probe (null) never shows the chip.
  useEffect(() => {
    let cancelled = false;
    if (!hasLoadedOnce) return;
    void Promise.all(steps.map(probeStepHasRain)).then((results) => {
      if (cancelled) return;
      if (results.some((r) => r === null)) return; // probe inconclusive
      setHasRain(results.some((r) => r === true));
    });
    return () => {
      cancelled = true;
    };
  }, [hasLoadedOnce, steps]);

  const { resolvedTheme } = useTheme();
  useEffect(() => {
    setBasemapIsDark(resolvedTheme === 'dark');
  }, [resolvedTheme]);

  // D-008: when the displayed analysis is older than 6h (possible in the
  // up-to-2h window before the next HRDPS run publishes), surface its age.
  const analysisAgeHours = useMemo(() => (Date.now() - runStart.getTime()) / 3600_000, [runStart]);
  const showUsingLastAnalysis = analysisAgeHours > 6;

  // WMS layer params — the `time` value drives which forecast step renders.
  // A new object identity on step change makes MapLibre replace its raster
  // source → redraw → new tiles for the new time (HTTP-cached after first pass).
  const wmsParams = useMemo(
    () => ({
      layers: MSC.LAYER,
      styles: MSC.STYLE,
      transparent: true,
      format: 'image/png',
      // MapLibre WMS template supplies EPSG:3857 through bbox placeholder.
      version: '1.3.0',
      time: steps[activeStepIndex],
    }),
    [steps, activeStepIndex],
  );
  const mapWms = useMemo(
    () => ({
      url: MSC.WMS_URL,
      layer: wmsParams.layers,
      style: wmsParams.styles,
      time: wmsParams.time,
      opacity: 0.5,
      nonce: retryNonce,
    }),
    [wmsParams, retryNonce],
  );

  // Errors are counted per tile batch. MapLibre can fire 'idle' after every
  // tile errored (errored tiles are marked as loaded), so a fully-failed
  // first batch would otherwise render a blank map with no error overlay —
  // the FR-008 failure mode. We count tileerror events per batch (reset on
  // 'loading') and treat a first batch with any errors as a failed load,
  // showing the retry overlay. Later batches (step switch / pan) keep the
  // previous behavior: 'load' clears loading, and the 20s hang guard below
  // handles the "nothing arrives at all" case with the stale pill.
  const batchErrors = useRef(0);
  const tileEventHandlers = useMemo(
    () => ({
      loading: () => {
        batchErrors.current = 0;
        setTileLoading(true);
      },
      load: () => {
        setTileLoading(false);
        if (!hasLoadedOnce && batchErrors.current > 0) {
          setTileError(true);
          return;
        }
        setHasLoadedOnce(true);
        setStaleError(false);
        setTileError(false);
      },
      tileerror: () => {
        batchErrors.current += 1;
      },
    }),
    [hasLoadedOnce],
  );

  // Autoplay: advance the step index on RAINFALL_AUTOPLAY_MS while playing.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isPlaying && stepCount > 0) {
      interval = setInterval(() => {
        setActiveStepIndex((prevIndex) => (prevIndex + 1) % stepCount);
      }, TIMING.RAINFALL_AUTOPLAY_MS);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, stepCount]);

  // Slow-network chip: surface after 10s of continuous tile loading.
  const [isSlow, setIsSlow] = useState(false);
  useEffect(() => {
    if (!tileLoading) {
      setIsSlow(false);
      return;
    }
    const id = setTimeout(() => setIsSlow(true), 10_000);
    return () => clearTimeout(id);
  }, [tileLoading]);

  // First-load / background failure timeout: if a tile batch never completes
  // within 20s (dead network, GeoMet outage), surface the error overlay when
  // nothing has rendered yet, or the stale pill when previous tiles are still
  // on screen. Retry bumps retryNonce and restarts the batch.
  useEffect(() => {
    if (!tileLoading) return;
    const id = setTimeout(() => {
      setTileLoading(false);
      if (hasLoadedOnce) setStaleError(true);
      else setTileError(true);
    }, 20_000);
    return () => clearTimeout(id);
  }, [tileLoading, hasLoadedOnce]);

  // Same 1080px breakpoint as the rest of the app (shared refcounted
  // matchMedia listener in useIsMobile).
  const isMobile = useIsMobile();
  // Keep map a few steps wider than Leaflet-era bounds; mobile gets one extra.
  const minZoom = isMobile ? 6 : 7;

  // Fit the viewport to the Vancouver bbox once (or on user-location change),
  // mirroring the HKO map's viewport-init behavior.
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
      } else {
        map.fitBounds([[VANCOUVER_BBOX.west, VANCOUVER_BBOX.south], [VANCOUVER_BBOX.east, VANCOUVER_BBOX.north]], { padding: 50 });
      }
      viewportInit.current = true;
    }
  }, [userLocation]);

  // Lock the map only until the FIRST tile batch renders (so a blank basemap
  // doesn't mislead about coverage), then release permanently. Do NOT key the
  // lock on tileLoading: a tile map fires 'loading' on every pan/zoom batch,
  // so locking on it would disable dragging/scroll-zoom the moment the user
  // starts interacting — the HKO map keys on its one-shot CSV fetch instead
  // (review finding: MSC map was not movable by mouse).
  const applyMapLockState = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const fn of ['dragPan', 'scrollZoom', 'doubleClickZoom', 'boxZoom', 'keyboard'] as const) {
      if (hasLoadedOnce) map[fn].enable();
      else map[fn].disable();
    }
  }, [hasLoadedOnce]);

  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const handleMapRef = useCallback(
    (map: Map | null) => {
      mapRef.current = map;
      if (map) {
        applyMapLockState();
        requestAnimationFrame(() => {
        map.resize();
        });
        resizeObserverRef.current?.disconnect();
        const observer = new ResizeObserver(() => map.resize());
        observer.observe(map.getContainer());
        resizeObserverRef.current = observer;
      } else {
        resizeObserverRef.current?.disconnect();
        resizeObserverRef.current = null;
      }
    },
    [applyMapLockState],
  );

  const { t } = useLanguage();

  return (
    <div className="absolute inset-0 flex flex-col">
      {hasLoadedOnce && stepCount > 0 && (
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
              <span className="text-lg font-bold text-foreground">
                {stepTimes[activeStepIndex]}
                <span className="ml-1.5 text-xs font-semibold text-muted-foreground" title="America/Vancouver">
                  {tzAbbr}
                </span>
              </span>
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
            {/* Step labels: many GeoMet steps overflow a 375-440 px card, so
                the row scrolls horizontally (hidden scrollbar) instead of
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

      <div className="rainfall-map-area no-swipe relative flex-1 min-h-0 w-full bg-muted/20">
        {/* Top-right control cluster: observation time + basemap + refresh. */}
        <div className="absolute top-2 right-2 z-[600] flex items-center gap-2 text-xs text-muted-foreground bg-background/90 backdrop-blur-sm p-1.5 rounded-md border border-border/50 shadow-sm">
          {observationTime && (
            <span className="px-1 tabular-nums">
              {formatString(t('nowcast.updated'), observationTime)} {tzAbbr}
            </span>
          )}
          <button
            onClick={() => setBasemapIsDark(v => !v)}
            className="inline-flex items-center justify-center min-h-[2.75rem] min-w-[2.75rem] p-1 hover:bg-muted/50 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={formatString(t('nowcast.switchBasemap'), t(basemapIsDark ? 'nowcast.basemapDark' : 'nowcast.basemapLight'))}
          >
            <Layers className="w-4 h-4" />
          </button>
          <button
            onClick={handleRefresh}
            className="inline-flex items-center justify-center min-h-[2.75rem] min-w-[2.75rem] p-1 hover:bg-muted/50 rounded transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={t('nowcast.refreshNowcast')}
            title={t('nowcast.refreshNowcast')}
          >
            <RefreshCw className={`w-4 h-4 ${tileLoading ? 'animate-spin text-primary' : ''}`} />
          </button>
        </div>

        {/* First load: spinner → slow-network chip */}
        {tileLoading && !hasLoadedOnce && (
          <div className="absolute inset-0 z-[1001] flex items-center justify-center bg-background/50 backdrop-blur-sm">
            {isSlow && (
              <div
                role="status"
                aria-live="polite"
                className="absolute top-3 left-1/2 -translate-x-1/2 z-[1002] flex items-center gap-2 text-xs bg-background/95 border border-border/60 rounded-full px-3 py-1.5 shadow-sm backdrop-blur-sm"
              >
                <RefreshCw className="w-3 h-3 animate-spin text-primary" />
                <span className="text-muted-foreground">{t('nowcast.loadingSlow')}</span>
              </div>
            )}
            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {/* First-load failure: full error overlay (no data to show). */}
        {tileError && !hasLoadedOnce && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm p-6 text-center">
            <AlertCircle className="w-10 h-10 text-destructive mb-2" />
            <p className="text-lg font-medium text-foreground mb-1">{t('nowcast.loadFailed')}</p>
            <p className="text-muted-foreground mb-4">{t('nowcast.error')}</p>
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              {t('nowcast.tryAgain')}
            </button>
          </div>
        )}

        {/* Background failure: stale pill — previous tiles still on screen. */}
        {staleError && hasLoadedOnce && (
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
              onClick={handleRefresh}
              className="ml-1 inline-flex items-center justify-center min-h-[2rem] min-w-[2rem] p-1 rounded hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={t('nowcast.tryAgain')}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* D-008: analysis older than 6h — surface its age. */}
        {showUsingLastAnalysis && (
          <div
            role="status"
            className="absolute top-12 right-2 z-[600] text-xs bg-background/90 border border-border/60 rounded-md px-2.5 py-1.5 backdrop-blur-sm shadow-sm text-muted-foreground"
          >
            {formatString(t('msc.usingLastAnalysis'), formatStepTime(runStart.toISOString()))}
          </div>
        )}

        <MapLibreMap
          center={[VANCOUVER_CENTER[1], VANCOUVER_CENTER[0]]}
          zoom={9}
          minZoom={minZoom}
          maxZoom={17}
          dark={basemapIsDark}
          interactive={hasLoadedOnce}
          ariaLabel={t('nowcast.mapLabel')}
          marker={userLocation ? [userLocation.longitude, userLocation.latitude] : undefined}
          wms={mapWms}
          onMap={handleMapRef}
          onOverlayLoading={tileEventHandlers.loading}
          onOverlayLoaded={tileEventHandlers.load}
          onOverlayError={tileEventHandlers.tileerror}
        />

        {/* Legend: GeoMet's discrete intensity classes as compact swatches.
            Replaces the tall GetLegendGraphic image (217×482) — colors and
            labels verified from GeoMet's legend + live tiles 2026-08-07. */}
        {hasLoadedOnce && (
          <div className="absolute bottom-4 right-4 z-[400] bg-background/90 backdrop-blur-sm p-3 rounded-lg border border-border shadow-lg text-xs">
            <div className="font-semibold mb-2">{t('msc.legendTitle')}</div>
            <div className="flex flex-col gap-1.5">
              {MSC_INTENSITY_BANDS.map(({ color, labelKey }) => (
                <div key={color} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: color }} aria-hidden="true" />
                  <span>{t(labelKey)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No-precipitation chip (non-blocking). Shown only when every
            probed step was dry; role=status announces it to screen readers
            (review issues 2, 5). */}
        {hasLoadedOnce && hasRain === false && (
          <div
            role="status"
            aria-live="polite"
            className="absolute bottom-4 left-4 z-[400] flex items-center gap-2 text-xs bg-background/90 border border-border/60 rounded-md px-2.5 py-1.5 backdrop-blur-sm shadow-sm text-muted-foreground"
          >
            <CloudRain className="w-3.5 h-3.5 shrink-0" />
            <span>{t('msc.noPrecipitation')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
