import { ReactNode } from 'react';
import { AlertTriangle, RefreshCw, WifiOff, type LucideIcon } from 'lucide-react';
import { WeatherData } from '@/lib/weather';
import { formatString, useLanguage } from '@/contexts/LanguageContext';
import { appLocale } from '@/lib/utils';

interface WeatherBannersProps {
  weather: WeatherData;
  /** Triggered by the red offline strip's "Refetch" button. */
  onRefetch?: () => void;
  /** True while a refetch is in flight (disables the button + shows spinner). */
  isRefetching?: boolean;
}

const STATUS_URL = 'https://status.open-meteo.com/';

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

/** External link to the Open-Meteo status page, shared by the amber strips. */
function StatusLink() {
  const { t } = useLanguage();
  return (
    <a
      href={STATUS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2 hover:opacity-80 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
    >
      {t('data.checkStatus')}
    </a>
  );
}

/**
 * Shared amber/red strip shell — same "thin-strip language" as
 * RainStartBanner: a slim one-line row instead of the former tall
 * icon-title-desc card, so a source failure informs without dominating
 * the page. Trailing content (status link / refetch button) sits inline
 * at the end of the row.
 *
 * WCAG 4.1.3 — informational amber uses role="status"; the offline (error)
 * strip uses role="alert" because it blocks the user from seeing live data.
 */
function SeverityStrip({
  severity,
  icon: Icon,
  children,
  action,
  testId,
  role,
}: {
  severity: Severity;
  icon: LucideIcon;
  children: ReactNode;
  /** Trailing inline element (refetch button), sits at the end of the row. */
  action?: ReactNode;
  testId: string;
  role: 'alert' | 'status';
}) {
  const c = SEVERITY_CLASSES[severity];
  return (
    <div
      className={`editorial-card ${c.border} ${c.bg} px-4 py-2 rounded-xl flex flex-wrap items-center gap-x-2 gap-y-1 ${c.text} text-xs animate-fade-in`}
      data-testid={testId}
      role={role}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 min-w-0">{children}</span>
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
      <SeverityStrip
        severity="warning"
        icon={AlertTriangle}
        testId="banner-hko"
        role="status"
      >
        {t('fallback.hkoShort')} <span aria-hidden="true">·</span> <StatusLink />
      </SeverityStrip>
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
      <SeverityStrip
        severity="warning"
        icon={AlertTriangle}
        testId="banner-partial"
        role="status"
      >
        {workingSource
          ? formatString(t('data.partialShort'), workingSource)
          : t('data.partialDataNoSource')}{' '}
        <span aria-hidden="true">·</span> <StatusLink />
      </SeverityStrip>
    );
  }

  // Cache: both sources failed, payload came from localStorage snapshot.
  if (weather.fallbackSource === 'cache' && weather.isFallback) {
    const ts = formatTimestamp(mostRecentCachedAt(weather), appLocale(language));
    const refetchButton = onRefetch ? (
      <button
        type="button"
        onClick={onRefetch}
        disabled={isRefetching}
        // WCAG 2.5.5 Level AAA: 44×44 CSS pixel tap target. min-h-11
        // (44px) lifts the offline refetch button above the 28px it had
        // with text-xs + py-1.5 alone; the px-3 padding keeps the visual
        // horizontal balance.
        className="shrink-0 inline-flex items-center gap-1.5 min-h-11 px-3 py-1.5 rounded-md bg-severity-error/15 hover:bg-severity-error/25 disabled:opacity-50 text-xs font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={t('data.refetchLive')}
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
        <span>{t('data.refetchLive')}</span>
      </button>
    ) : undefined;
    return (
      <SeverityStrip
        severity="error"
        icon={WifiOff}
        action={refetchButton}
        testId="banner-cache"
        role="alert"
      >
        {ts ? formatString(t('data.offlineShort'), ts) : t('data.offline')}
      </SeverityStrip>
    );
  }

  return null;
}
