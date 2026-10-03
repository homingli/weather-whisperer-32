import { getDateTimeFormatter } from '@/lib/utils';
import type { Holiday } from './nager';

export interface HolidayCountdown {
  holiday: Holiday;
  /** Whole calendar days from today (city's timezone): 0 = today, 1 = tomorrow. */
  daysUntil: number;
  isToday: boolean;
}

/**
 * Today's calendar date (`yyyy-MM-dd`) as seen from `timeZone`, so the
 * countdown follows the holiday jurisdiction's calendar rather than the
 * device's. Uses formatToParts (not format()) so the ISO shape does not
 * depend on ICU spacing quirks. An invalid zone (user-supplied city with a
 * bogus tz) degrades to the browser-local calendar date.
 */
export function todayIsoInZone(now: Date, timeZone: string): string {
  const dateOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };
  const toIso = (options: Intl.DateTimeFormatOptions): string => {
    const parts = getDateTimeFormatter('en-CA', options).formatToParts(now);
    const pick = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((p) => p.type === type)?.value ?? '';
    return `${pick('year')}-${pick('month')}-${pick('day')}`;
  };

  try {
    return toIso({ ...dateOptions, timeZone });
  } catch {
    return toIso(dateOptions);
  }
}

/**
 * The next holiday on/after `todayIso` from the (current + next year)
 * holiday list. Both inputs are plain `yyyy-MM-dd` calendar dates, so the
 * comparison and day-diff are timezone-free by construction.
 */
export function nextHoliday(holidays: Holiday[], todayIso: string): HolidayCountdown | null {
  const holiday = holidays
    .filter((h) => h.date >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!holiday) return null;
  const daysUntil = calendarDaysBetween(todayIso, holiday.date);
  return { holiday, daysUntil, isToday: daysUntil === 0 };
}

/** Whole days from `aIso` to `bIso` via UTC-day arithmetic. */
function calendarDaysBetween(aIso: string, bIso: string): number {
  const toUtc = (iso: string): number =>
    Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  return Math.round((toUtc(bIso) - toUtc(aIso)) / 86_400_000);
}
