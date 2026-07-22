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
        className="glass-card border-amber-500/20 bg-amber-500/5 p-4 rounded-xl flex items-start gap-3 text-amber-600 dark:text-amber-400 animate-fade-in"
        data-testid="banner-hko"
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
        className="glass-card border-amber-500/20 bg-amber-500/5 p-4 rounded-xl flex items-start gap-3 text-amber-600 dark:text-amber-400 animate-fade-in"
        data-testid="banner-partial"
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
        className="glass-card border-red-500/30 bg-red-500/5 p-4 rounded-xl flex items-start gap-3 text-red-600 dark:text-red-400 animate-fade-in"
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
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500/15 hover:bg-red-500/25 disabled:opacity-50 text-xs font-medium transition-colors"
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
        className="glass-card border-amber-500/20 bg-amber-500/5 p-4 rounded-xl flex items-start gap-3 text-amber-600 dark:text-amber-400 animate-fade-in"
        data-testid="banner-hko-failed"
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