import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { RefreshCw, CloudRain } from 'lucide-react';
import { useLanguage, formatString } from '@/contexts/LanguageContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { MSC, VANCOUVER_BBOX, VANCOUVER_CENTER } from '@/lib/constants';
import { buildMscStepTimes, formatStepTime, formatObservationTime, vancouverTimeZoneAbbr, buildProbeUrl } from '@/lib/msc-wms';
import { markMscMapMounted } from '@/lib/msc-prefetch';
import { logWarn } from '@/lib/log';
import { MapLibreMap } from './MapLibreMap';
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
  const viewportInit = useRef(false);
  const prevUserLoc = useRef<string | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const { basemapIsDark, toggleBasemap } = useBasemapDark();
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

  useAutoplayStep(isPlaying, stepCount, () => {
    setActiveStepIndex((prevIndex) => (prevIndex + 1) % stepCount);
  });

  // Slow-network chip: surface after 10s of continuous tile loading.
  const isSlow = useSlowFlag(tileLoading);

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
  const { mapRef, handleMapRef } = useMapLockRef(hasLoadedOnce);

  // Manual step selection (slider or label click) pauses autoplay.
  const selectStep = useCallback((index: number) => {
    setActiveStepIndex(index);
    setIsPlaying(false);
  }, []);

  const { t } = useLanguage();

  return (
    <div className="absolute inset-0 flex flex-col">
      {hasLoadedOnce && stepCount > 0 && (
        <NowcastTimelineBar
          stepTimes={stepTimes}
          activeStepIndex={activeStepIndex}
          isPlaying={isPlaying}
          onTogglePlay={() => setIsPlaying(!isPlaying)}
          onSelectStep={selectStep}
          trailing={
            <span className="ml-1.5 text-xs font-semibold text-muted-foreground" title="America/Vancouver">
              {tzAbbr}
            </span>
          }
        />
      )}

      <div className="rainfall-map-area no-swipe relative flex-1 min-h-0 w-full bg-muted/20">
        <MapTopRightControls
          time={observationTime ? (
            <>
              {formatString(t('nowcast.updated'), observationTime)} {tzAbbr}
            </>
          ) : undefined}
          basemapIsDark={basemapIsDark}
          onToggleBasemap={toggleBasemap}
          onRefresh={handleRefresh}
          refreshSpinning={tileLoading}
        />

        {/* First load: spinner → slow-network chip */}
        {tileLoading && !hasLoadedOnce && (
          <div className="absolute inset-0 z-1001 flex items-center justify-center bg-background/50 backdrop-blur-xs">
            {isSlow && <SlowChip />}
            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {/* First-load failure: full error overlay (no data to show). */}
        {tileError && !hasLoadedOnce && (
          <MapErrorOverlay onRetry={handleRefresh} />
        )}

        {/* Background failure: stale pill — previous tiles still on screen. */}
        {staleError && hasLoadedOnce && (
          <StaleErrorPill onRetry={handleRefresh} />
        )}

        {/* D-008: analysis older than 6h — surface its age. */}
        {showUsingLastAnalysis && (
          <div
            role="status"
            className="absolute top-12 right-2 z-600 text-xs bg-background/90 border border-border/60 rounded-md px-2.5 py-1.5 backdrop-blur-xs shadow-xs text-muted-foreground"
          >
            {formatString(t('msc.usingLastAnalysis'), formatStepTime(runStart.toISOString()))}
          </div>
        )}

        <MapLibreMap
          center={[VANCOUVER_CENTER[1], VANCOUVER_CENTER[0]]}
          zoom={12}
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
          <MapLegend
            title={t('msc.legendTitle')}
            bands={MSC_INTENSITY_BANDS.map(({ color, labelKey }) => ({ color, label: t(labelKey) }))}
          />
        )}

        {/* No-precipitation chip (non-blocking). Shown only when every
            probed step was dry; role=status announces it to screen readers
            (review issues 2, 5). */}
        {hasLoadedOnce && hasRain === false && (
          <div
            role="status"
            aria-live="polite"
            className="absolute bottom-4 left-4 z-400 flex items-center gap-2 text-xs bg-background/90 border border-border/60 rounded-md px-2.5 py-1.5 backdrop-blur-xs shadow-xs text-muted-foreground"
          >
            <CloudRain className="w-3.5 h-3.5 shrink-0" />
            <span>{t('msc.noPrecipitation')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
