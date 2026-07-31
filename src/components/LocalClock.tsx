import { memo, useState, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatInTimezone, appLocale } from "@/lib/utils";

interface LocalClockProps {
  /** IANA timezone (e.g. "Asia/Hong_Kong"). When undefined, falls back to the browser locale. */
  timezone?: string;
}

/**
 * LocalClock — owns the per-second state for the date/time display.
 *
 * Extracted from CurrentWeather so the rest of the card stays referentially stable
 * (useMemo, Intl.DateTimeFormat instances via the shared cache) while only this
 * small subtree re-renders each tick.
 *
 * The displayed time format includes seconds, so a 1-second interval is justified.
 * TODO: if the format ever drops to minute precision, switch to setInterval(..., 60_000)
 *       and drop the seconds from the formatter options.
 */
export const LocalClock = memo(({ timezone }: LocalClockProps) => {
  const { language } = useLanguage();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
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
        second: '2-digit',
        hour12,
      })
    : currentTime.toLocaleTimeString();

  // Compact formats for narrow viewports — the full date + time with seconds
  // doesn't fit in the header row when warnings + settings are pinned to
  // the right on a 360-411px phone. Drop weekday + seconds below `sm`.
  const shortDateText = timezone
    ? formatInTimezone(currentTime, locale, {
        timeZone: timezone,
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : currentTime.toLocaleDateString();

  const shortTimeText = timezone
    ? formatInTimezone(currentTime, locale, {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12,
      })
    : currentTime.toLocaleTimeString();

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
        {/* Drop seconds on narrow viewports to keep the row compact. */}
        <span className="hidden sm:inline">{timeText}</span>
        <span className="sm:hidden">{shortTimeText}</span>
      </span>
    </div>
  );
});
LocalClock.displayName = 'LocalClock';