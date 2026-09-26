import { useCallback } from 'react';
import { Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUnits } from '@/contexts/UnitsContext';
import { buildForecastShareText, buildHourlyForecastShareText } from '@/lib/share-forecast';
import type { DailyForecast, HourlyForecast } from '@/lib/weather';

interface ShareForecastButtonProps {
  /** Display name of the selected city. */
  cityName: string;
  /** Which card the button lives in — picks the message builder. */
  mode?: 'daily' | 'hourly';
  /** Upcoming daily forecasts to include in the message (mode 'daily'). */
  days?: DailyForecast[];
  /** Upcoming hourly forecasts to include in the message (mode 'hourly'). */
  hours?: HourlyForecast[];
  /** IANA timezone of the forecast location. */
  timezone?: string;
}

/**
 * "Share forecast" — hands the upcoming days' (or hours', see `mode`)
 * weather to the platform share sheet (so the user can pick the chat/
 * friends to send it to) when the Web Share API is available, and falls
 * back to copying the message with a toast elsewhere. Lives in the daily-
 * and hourly-forecast card headers, next to the kicker.
 */
export function ShareForecastButton({ cityName, mode = 'daily', days, hours, timezone }: ShareForecastButtonProps) {
  const { language, t } = useLanguage();
  const { units } = useUnits();

  const handleShare = useCallback(async () => {
    const text = mode === 'hourly'
      ? buildHourlyForecastShareText({
          cityName,
          hours: hours ?? [],
          units,
          language,
          timezone,
          translate: (key) => t(key),
          url: window.location.origin,
        })
      : buildForecastShareText({
          cityName,
          days: days ?? [],
          units,
          language,
          timezone,
          translate: (key) => t(key),
          url: window.location.origin,
        });

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: t('share.title'), text });
        return;
      } catch (err) {
        // User dismissed the share sheet — not an error.
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // Anything else (unsupported content, denied permission) — fall
        // through to the clipboard fallback below.
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('share.copied'));
    } catch {
      toast.error(t('share.copyFailed'));
    }
  }, [mode, cityName, days, hours, timezone, units, language, t]);

  const count = mode === 'hourly' ? (hours?.length ?? 0) : (days?.length ?? 0);

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={count === 0}
      aria-label={t('share.forecast')}
      title={t('share.forecast')}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
    >
      <Share2 className="h-4 w-4" aria-hidden />
    </button>
  );
}
