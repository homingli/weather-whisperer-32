import { memo, useState, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatInTimezone, appLocale } from "@/lib/utils";

interface LocalClockProps {
  /** IANA timezone (e.g. "Asia/Hong_Kong"). When undefined, falls back to the browser locale. */
  timezone?: string;
}

/** Match the Tailwind `sm:` breakpoint — below this width the clock drops
 *  seconds from the display, so the polling interval can drop to 60s. */
const NARROW_VIEWPORT_QUERY = '(max-width: 639px)';

/**
 * LocalClock — owns the per-tick state for the date/time display.
 *
 * Extracted from CurrentWeather so the rest of the card stays referentially stable
 * (useMemo, Intl.DateTimeFormat instances via the shared cache) while only this
 * small subtree re-renders each tick.
 *
 * The polling interval tracks the displayed precision:
 *   - wide viewport (>= sm): seconds shown → 1s interval (justified).
 *   - narrow viewport (< sm): seconds hidden  → 60s interval (60× fewer re-renders
 *     when the user only sees minutes). The interval re-binds on viewport changes.
 */
export const LocalClock = memo(({ timezone }: LocalClockProps) => {
  const { language } = useLanguage();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(NARROW_VIEWPORT_QUERY).matches,
  );

  // Re-render the tick interval when viewport crosses the sm breakpoint.
  useEffect(() => {
    const mq = window.matchMedia(NARROW_VIEWPORT_QUERY);
    const handler = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const periodMs = isNarrow ? 60_000 : 1_000;
    // Align the first tick to the next minute boundary on narrow viewports so
    // the displayed minute flips exactly when the wall clock does, not 0–59s
    // after a viewport resize.
    const initialDelay = isNarrow
      ? Math.max(0, 60_000 - (Date.now() % 60_000))
      : 0;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    if (initialDelay > 0) {
      setCurrentTime(new Date());
      timeoutId = setTimeout(() => {
        setCurrentTime(new Date());
        intervalId = setInterval(() => setCurrentTime(new Date()), periodMs);
      }, initialDelay);
    } else {
      intervalId = setInterval(() => setCurrentTime(new Date()), periodMs);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [isNarrow]);

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
        {/* Drop seconds on narrow viewports to keep the row compact. The
            timer interval is also dropped to 60s in that case (see useEffect
            above) so we don't burn re-renders on a value the user can't see. */}
        {isNarrow ? shortTimeText : timeText}
      </span>
    </div>
  );
});
LocalClock.displayName = 'LocalClock';