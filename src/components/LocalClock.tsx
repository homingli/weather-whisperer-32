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
 * If the format ever drops to minute precision, switch to setInterval(..., 60_000).
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

  return (
    <div>
      <p className="text-base text-muted-foreground uppercase tracking-[0.2em] mb-2">
        {dateText}
      </p>
      <p className="text-5xl font-extralight text-foreground tracking-tighter tabular-nums leading-none">
        {timeText}
      </p>
    </div>
  );
});
LocalClock.displayName = 'LocalClock';