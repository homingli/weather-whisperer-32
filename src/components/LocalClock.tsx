import { memo, useState, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatInTimezone, appLocale } from "@/lib/utils";

interface LocalClockProps {
  /** IANA timezone (e.g. "Asia/Hong_Kong"). When undefined, falls back to the browser locale. */
  timezone?: string;
}

const MINUTE_MS = 60_000;

/**
 * LocalClock — owns the per-tick state for the date/time display.
 *
 * Extracted from CurrentWeather so the rest of the card stays referentially stable
 * (useMemo, Intl.DateTimeFormat instances via the shared cache) while only this
 * small subtree re-renders each tick.
 *
 * A weather forecast is minute-accurate at best, so the clock shows HH:MM
 * (no seconds, on any viewport) and ticks once a minute — 60× fewer
 * re-renders than a seconds display. The first tick is aligned to the next
 * minute boundary so the displayed minute flips exactly when the wall clock
 * does, not 0–59s after mount.
 */
export const LocalClock = memo(({ timezone }: LocalClockProps) => {
  const { language } = useLanguage();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const initialDelay = Math.max(0, MINUTE_MS - (Date.now() % MINUTE_MS));
    const timeoutId = setTimeout(() => {
      setCurrentTime(new Date());
      intervalId = setInterval(() => setCurrentTime(new Date()), MINUTE_MS);
    }, initialDelay);
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const locale = appLocale(language);
  const hour12 = language !== 'tc';

  const dateText = timezone
    ? formatInTimezone(currentTime, locale, {
        timeZone: timezone,
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
      })
    : currentTime.toLocaleDateString();

  const timeText = timezone
    ? formatInTimezone(currentTime, locale, {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12,
      })
    : currentTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12 });

  // Compact date for narrow viewports — the full weekday + date doesn't fit
  // in the header row when warnings + settings are pinned to the right on a
  // 360-411px phone.
  const shortDateText = timezone
    ? formatInTimezone(currentTime, locale, {
        timeZone: timezone,
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : currentTime.toLocaleDateString();

  return (
    <div className="flex items-baseline gap-1.5 sm:gap-2 whitespace-nowrap">
      {/* Long-form date on sm+, compact "MMM D, YYYY" below so the
          warnings+settings row never pushes off-screen on narrow phones. */}
      <span className="hidden sm:inline text-sm uppercase tracking-[0.18em] text-muted-foreground tabular-nums">
        {dateText}
      </span>
      <span className="sm:hidden text-xs uppercase tracking-[0.14em] text-muted-foreground tabular-nums">
        {shortDateText}
      </span>
      <span aria-hidden className="text-xs sm:text-sm text-muted-foreground/60">|</span>
      <span className="text-xs sm:text-sm uppercase tracking-[0.14em] sm:tracking-[0.18em] text-foreground tabular-nums">
        {timeText}
      </span>
    </div>
  );
});
LocalClock.displayName = 'LocalClock';
