import { ReactNode } from 'react';
import { AlertTriangle, RefreshCw, WifiOff, type LucideIcon } from 'lucide-react';
import { WeatherData } from '@/lib/weather';
import { formatString, useLanguage } from '@/contexts/LanguageContext';

interface WeatherBannersProps {
  weather: WeatherData;
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

type Severity = 'warning' | 'error';

const SEVERITY_CLASSES: Record<Severity, { border: string; bg: string; text: string }> = {
  warning: {
    border: 'border-severity-warning/20',
    bg: 'bg-severity-warning/5',
    text: 'text-severity-warning',
  },
  error: {
    border: 'border-severity-error/30',
    bg: 'bg-severity-error/5',
    text: 'text-severity-error',
  },
};

/**
 * Shared amber/red banner shell. Used for legacy HKO, partial-source, and
 * offline-cache notifications — all three share the same outline, padding,
 * and icon-title-desc layout; only the severity tone, icon, copy, and
 * optional trailing action differ.
 *
 * WCAG 4.1.3 — informational amber uses role="status"; the offline (error)
 * banner uses role="alert" because it blocks the user from seeing live data.
 */
function SeverityBanner({
  severity,
  icon: Icon,
  title,
  desc,
  action,
  testId,
  role,
}: {
  severity: Severity;
  icon: LucideIcon;
  title: string;
  desc: string;
  action?: ReactNode;
  testId: string;
  role: 'alert' | 'status';
}) {
  const c = SEVERITY_CLASSES[severity];
  return (
    <div
      className={`glass-card ${c.border} ${c.bg} p-4 rounded-xl flex items-start gap-3 ${c.text} animate-fade-in`}
      data-testid={testId}
      role={role}
    >
      <Icon className="h-5 w-5 shrink-0 mt-0.5" />
      <div className={action ? 'flex-1 min-w-0' : undefined}>
        <h4 className="font-semibold text-sm">{title}</h4>
        <p className="text-xs opacity-90 mt-1">{desc}</p>
      </div>
      {action}
    </div>
  );
}

/**
 * Warning banners for fallback mode and offline state. Three tones:
 *   - 'partial' (amber): one source live, one missing — names the working one
 *   - 'cache'   (red)  : both sources failed, showing localStorage snapshot
 *                        with timestamp and a refetch button
 *   - 'HKO'     (amber): HKO-only fallback — OM unavailable, HKO carries
 *                        the show (HK path)
 */
export function WeatherBanners({ weather, onRefetch, isRefetching }: WeatherBannersProps) {
  const { t, language } = useLanguage();

  // HKO-only fallback: OM unavailable, HKO carries the show (HK path).
  if (weather.fallbackSource === 'HKO' && weather.isFallback) {
    return (
      <SeverityBanner
        severity="warning"
        icon={AlertTriangle}
        title={t('fallback.hkoTitle')}
        desc={t('fallback.hkoDesc')}
        testId="banner-hko"
        role="status"
      />
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
      <SeverityBanner
        severity="warning"
        icon={AlertTriangle}
        title={
          workingSource
            ? formatString(t('data.partialData'), workingSource)
            : t('data.partialDataNoSource')
        }
        desc={t('data.partialDataDesc')}
        testId="banner-partial"
        role="status"
      />
    );
  }

  // Cache: both sources failed, payload came from localStorage snapshot.
  if (weather.fallbackSource === 'cache' && weather.isFallback) {
    const ts = formatTimestamp(mostRecentCachedAt(weather), language === 'tc' ? 'zh-HK' : 'en-US');
    const refetchButton = onRefetch ? (
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
    ) : undefined;
    return (
      <SeverityBanner
        severity="error"
        icon={WifiOff}
        title={ts ? formatString(t('data.offlineWithTs'), ts) : t('data.offline')}
        desc={t('data.offlineDesc')}
        action={refetchButton}
        testId="banner-cache"
        role="alert"
      />
    );
  }

  return null;
}