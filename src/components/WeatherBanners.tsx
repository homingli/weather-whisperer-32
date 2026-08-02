import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { WeatherData } from '@/lib/weather';
import { formatString, useLanguage } from '@/contexts/LanguageContext';

interface WeatherBannersProps {
  weather: WeatherData;
  isHKCovered: boolean;
  /** Triggered by the red offline banner's "Refetch" button. */
  onRefetch?: () => void;
  /** True while a refetch is in flight (disables the button + shows spinner). */
  isRefetching?: boolean;
}

/** Most-recent non-zero cachedAt across the available sources, or 0 if none. */
function mostRecentCachedAt(weather: WeatherData): number {
  const stamps = [weather.sources?.om?.cachedAt, weather.sources?.hko?.cachedAt]
    .filter((v): v is number => typeof v === 'number' && v > 0);
  return stamps.length ? Math.max(...stamps) : 0;
}

function formatTimestamp(epoch: number, locale: string): string {
  if (!epoch) return '';
  return new Date(epoch).toLocaleString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Warning banners for fallback mode and offline state. Three tones:
 *   - 'partial' (amber): one source live, one missing — names the working one
 *   - 'cache'   (red)  : both sources failed, showing localStorage snapshot
 *                        with timestamp and a refetch button
 *   - 'HKO'     (amber): legacy — HKO-only fallback path produced the data
 */
export function WeatherBanners({ weather, isHKCovered, onRefetch, isRefetching }: WeatherBannersProps) {
  const { t, language } = useLanguage();

  // Legacy HKO banner (kept for backward compatibility with the existing
  // 'fallback.hkoTitle' / 'fallback.hkoDesc' copy).
  if (weather.fallbackSource === 'HKO' && weather.isFallback) {
    return (
      <div
        className="glass-card border-severity-warning/20 bg-severity-warning/5 p-4 rounded-xl flex items-start gap-3 text-severity-warning animate-fade-in"
        data-testid="banner-hko"
        // WCAG 4.1.3 — informational amber, not an interruption. Use
        // role="status" so screen readers don't barge in over the user's
        // current speech. The offline cache banner (below) remains
        // role="alert" because it blocks the user from seeing live data.
        role="status"
      >
        <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
        <div>
          <h4 className="font-semibold text-sm">{t('fallback.hkoTitle')}</h4>
          <p className="text-xs opacity-90 mt-1">{t('fallback.hkoDesc')}</p>
        </div>
      </div>
    );
  }

  // Partial: one source live, one failed.
  if (weather.fallbackSource === 'partial' && weather.isFallback) {
    const omOk = weather.sources?.om?.ok;
    const hkoOk = weather.sources?.hko?.ok;
    const workingSource = omOk
      ? t('source.openMeteo')
      : hkoOk
        ? t('source.hko')
        : '';
    return (
      <div
        className="glass-card border-severity-warning/20 bg-severity-warning/5 p-4 rounded-xl flex items-start gap-3 text-severity-warning animate-fade-in"
        data-testid="banner-partial"
        // WCAG 4.1.3 — informational amber, not an interruption. Use
        // role="status" so screen readers don't barge in over the user's
        // current speech.
        role="status"
      >
        <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
        <div>
          <h4 className="font-semibold text-sm">
            {workingSource
              ? formatString(t('data.partialData'), workingSource)
              : t('data.partialDataNoSource')}
          </h4>
          <p className="text-xs opacity-90 mt-1">
            {t('data.partialDataDesc')}
          </p>
        </div>
      </div>
    );
  }

  // Cache: both sources failed, payload came from localStorage snapshot.
  if (weather.fallbackSource === 'cache' && weather.isFallback) {
    const ts = formatTimestamp(mostRecentCachedAt(weather), language === 'tc' ? 'zh-HK' : 'en-US');
    return (
      <div
        className="glass-card border-severity-error/30 bg-severity-error/5 p-4 rounded-xl flex items-start gap-3 text-severity-error animate-fade-in"
        data-testid="banner-cache"
        role="alert"
      >
        <WifiOff className="h-5 w-5 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm">
            {ts
              ? formatString(t('data.offlineWithTs'), ts)
              : t('data.offline')}
          </h4>
          <p className="text-xs opacity-90 mt-1">{t('data.offlineDesc')}</p>
        </div>
        {onRefetch && (
          <button
            type="button"
            onClick={onRefetch}
            disabled={isRefetching}
            // WCAG 2.5.5 Level AAA: 44×44 CSS pixel tap target. min-h-[2.75rem]
            // (44px) lifts the offline refetch button above the 28px it had
            // with text-xs + py-1.5 alone; the px-3 padding keeps the visual
            // horizontal balance.
            className="shrink-0 inline-flex items-center gap-1.5 min-h-[2.75rem] px-3 py-1.5 rounded-md bg-severity-error/15 hover:bg-severity-error/25 disabled:opacity-50 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={t('data.refetchLive')}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
            <span>{t('data.refetchLive')}</span>
          </button>
        )}
      </div>
    );
  }

  // Backward-compat: the original banner also showed an amber note when
  // hkoFailed was set but isFallback wasn't. With the new orchestrator this
  // path is dead (we always set isFallback for partial cases), but keep the
  // branch in case a future producer needs it.
  if (weather.hkoFailed && !weather.isFallback && isHKCovered) {
    return (
      <div
        className="glass-card border-severity-warning/20 bg-severity-warning/5 p-4 rounded-xl flex items-start gap-3 text-severity-warning animate-fade-in"
        data-testid="banner-hko-failed"
        // WCAG 4.1.3 — informational amber, not an interruption. Use
        // role="status" so screen readers don't barge in over the user's
        // current speech.
        role="status"
      >
        <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
        <div>
          <h4 className="font-semibold text-sm">{t('fallback.hkoFailedTitle')}</h4>
          <p className="text-xs opacity-90 mt-1">{t('fallback.hkoFailedDesc')}</p>
        </div>
      </div>
    );
  }

  return null;
}