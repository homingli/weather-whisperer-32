import type { ReactNode } from 'react';
import { AlertCircle, RefreshCw, Play, Pause, Layers } from 'lucide-react';
import { useLanguage, formatString } from '@/contexts/LanguageContext';

/**
 * Chrome shared by the two nowcast maps (HKO gridded rainfall in
 * RainfallMapInner and MSC GeoMet WMS in MSCRainfallMapInner). Everything
 * here is pixel-identical between the two maps; data-specific UI (download
 * progress bars, MSC's age pill and dry-forecast chip) stays in the
 * components. Gating conditions (isLoading / hasLoadedOnce) stay with the
 * callers.
 */

export interface UserLocation {
  latitude: number;
  longitude: number;
}

/**
 * Step-control bar under the map header: play/pause, active step time,
 * range slider and the horizontally-scrolling step-label row.
 *
 * `trailing` carries source-specific bits into the time readout (MSC shows
 * the Vancouver timezone abbreviation next to its step time).
 */
export function NowcastTimelineBar({
  stepTimes,
  activeStepIndex,
  isPlaying,
  onTogglePlay,
  onSelectStep,
  trailing,
}: {
  stepTimes: string[];
  activeStepIndex: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSelectStep: (index: number) => void;
  trailing?: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <div className="px-6 py-5 bg-background/50 border-b border-border/50 flex flex-row items-center gap-4 sm:gap-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onTogglePlay}
          className="p-2.5 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors shadow-xs"
          title={isPlaying ? t('nowcast.pause') : t('nowcast.play')}
          aria-label={isPlaying ? t('nowcast.pause') : t('nowcast.play')}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
        </button>
        <div className="flex flex-col min-w-[80px]">
          <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">{t('nowcast.forecastStep')}</span>
          <span className="text-lg font-bold text-foreground">
            {stepTimes[activeStepIndex]}
            {trailing}
          </span>
        </div>
      </div>

      <div className="flex-1 min-w-0 w-full flex flex-col gap-2">
        <input
          type="range"
          min={0}
          max={stepTimes.length - 1}
          value={activeStepIndex}
          onChange={(e) => onSelectStep(parseInt(e.target.value))}
          className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={t('nowcast.slider')}
        />
        {/* Step labels: many GeoMet/HKO steps overflow a 375-440 px card,
            so the row scrolls horizontally (hidden scrollbar) instead of
            clipping against the card's overflow-x:hidden. w-max keeps the
            flex content sized to the buttons; min-w-full + justify-between
            spread a small step count across the full width. */}
        <div className="overflow-x-auto text-xs font-semibold text-muted-foreground -mx-1 px-1 scrollbar-none [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max min-w-full items-center justify-between gap-x-1">
          {stepTimes.map((time, index) => (
            <button
              key={index}
              onClick={() => onSelectStep(index)}
              aria-current={index === activeStepIndex ? 'true' : undefined}
              className={`px-2 py-1 whitespace-nowrap min-h-6 rounded hover:text-primary transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
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
  );
}

/**
 * Top-right control cluster: updated time + basemap switcher + refresh.
 * Bottom-left is reserved for the swiper pagination dots on mobile, so
 * these buttons live at the top-right where nothing else competes.
 * z-600 = above the map canvas, below dialog content.
 */
export function MapTopRightControls({
  time,
  basemapIsDark,
  onToggleBasemap,
  onRefresh,
  refreshDisabled = false,
  refreshSpinning,
}: {
  time?: ReactNode;
  basemapIsDark: boolean;
  onToggleBasemap: () => void;
  onRefresh: () => void;
  refreshDisabled?: boolean;
  refreshSpinning: boolean;
}) {
  const { t } = useLanguage();
  return (
    <div className="absolute top-2 right-2 z-600 flex items-center gap-2 text-xs text-muted-foreground bg-background/90 backdrop-blur-xs p-1.5 rounded-md border border-border/50 shadow-xs">
      {time && (
        <span className="px-1 tabular-nums">{time}</span>
      )}
      <button
        onClick={onToggleBasemap}
        // WCAG 2.5.5 Level AAA: 44×44 CSS pixel tap target. min-h/-w
        // overrides the p-1 default so the small icon stays inside a
        // phone-sized hit zone. inline-flex + items-center +
        // justify-center centers the icon in the 44×44 box.
        className="inline-flex items-center justify-center min-h-11 min-w-11 p-1 hover:bg-muted/50 rounded transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={formatString(t('nowcast.switchBasemap'), t(basemapIsDark ? 'nowcast.basemapDark' : 'nowcast.basemapLight'))}
      >
        <Layers className="w-4 h-4" />
      </button>
      <button
        onClick={onRefresh}
        className="inline-flex items-center justify-center min-h-11 min-w-11 p-1 hover:bg-muted/50 rounded transition-colors disabled:opacity-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        disabled={refreshDisabled}
        aria-label={t('nowcast.refreshNowcast')}
        title={t('nowcast.refreshNowcast')}
      >
        <RefreshCw className={`w-4 h-4 ${refreshSpinning ? 'animate-spin text-primary' : ''}`} />
      </button>
    </div>
  );
}

/** Slow-network chip shown inside the loading overlay after the load has
 *  held for NOWCAST_SLOW_CHIP_MS. aria-live="polite" announces the state
 *  change to screen readers without interrupting the loading announcement. */
export function SlowChip() {
  const { t } = useLanguage();
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute top-3 left-1/2 -translate-x-1/2 z-1002 flex items-center gap-2 text-xs bg-background/95 border border-border/60 rounded-full px-3 py-1.5 shadow-xs backdrop-blur-xs"
    >
      <RefreshCw className="w-3 h-3 animate-spin text-primary" />
      <span className="text-muted-foreground">{t('nowcast.loadingSlow')}</span>
    </div>
  );
}

/**
 * Full-screen error overlay for when there is no data to show (initial
 * fetch failed and there's no cache fallback). When data is already on
 * screen, use StaleErrorPill instead so the map stays interactive.
 */
export function MapErrorOverlay({ onRetry }: { onRetry: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-xs p-6 text-center">
      <AlertCircle className="w-10 h-10 text-destructive mb-2" />
      <p className="text-lg font-medium text-foreground mb-1">{t('nowcast.loadFailed')}</p>
      <p className="text-muted-foreground mb-4">{t('nowcast.error')}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
      >
        {t('nowcast.tryAgain')}
      </button>
    </div>
  );
}

/**
 * Stale-data indicator: the last fetch failed but current data is still on
 * screen. Pinned top-left below the zoom control so it doesn't fight with
 * the control cluster at top-right. `retryDisabled`/`retrySpinning` reflect
 * an in-flight retry; MSC omits them (its refresh is a state reset, never
 * disabled).
 */
export function StaleErrorPill({
  onRetry,
  retryDisabled = false,
  retrySpinning = false,
}: {
  onRetry: () => void;
  retryDisabled?: boolean;
  retrySpinning?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute top-12 left-2 z-600 flex items-center gap-2 max-w-[min(90%,360px)] text-xs bg-destructive/10 text-destructive border border-destructive/30 rounded-md px-2.5 py-1.5 backdrop-blur-xs shadow-xs"
    >
      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
      <div className="flex flex-col leading-tight">
        <span className="font-semibold">{t('nowcast.staleTitle')}</span>
        <span className="text-destructive/80">{t('nowcast.staleDesc')}</span>
      </div>
      <button
        onClick={onRetry}
        disabled={retryDisabled}
        className="ml-1 inline-flex items-center justify-center min-h-8 min-w-8 p-1 rounded hover:bg-destructive/20 disabled:opacity-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={t('nowcast.tryAgain')}
      >
        <RefreshCw className={`w-3.5 h-3.5 ${retrySpinning ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
}

/**
 * Compact legend card pinned bottom-right. Bands arrive pre-localized as
 * {color, label} — each map maps its own band table (HKO mm bands vs MSC's
 * i18n intensity keys).
 */
export function MapLegend({ title, bands }: { title: string; bands: readonly { color: string; label: string }[] }) {
  return (
    <div className="absolute bottom-4 right-4 z-400 bg-background/90 backdrop-blur-xs p-3 rounded-lg border border-border shadow-lg text-xs">
      <div className="font-semibold mb-2">{title}</div>
      <div className="flex flex-col gap-1.5">
        {bands.map(({ color, label }) => (
          <div key={color} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: color }} aria-hidden="true" />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
