import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchHolidays, type Holiday } from '@/lib/holidays/nager';
import {
  nextHoliday,
  todayIsoInZone,
  type HolidayCountdown,
} from '@/lib/holidays/nextHoliday';

const MINUTE_MS = 60_000;

/**
 * Countdown to the next HK public holiday, or `undefined` while disabled
 * (non-HK city), loading, or when there is nothing to show — callers treat
 * it as "hide the badge" (same self-hiding contract as the AQHI widgets).
 *
 * Holiday data is immutable per year, so the query caches per
 * (region, year) with staleTime Infinity and fetches the current AND next
 * year's lists in one go — that keeps the late-December countdown to
 * New Year's Day working across the year boundary. Failures fall back to
 * the bundled snapshot inside fetchHolidays, so the query only truly
 * fails for years no snapshot covers (and the badge then just hides).
 *
 * The countdown itself is derived from a per-minute "today" tick rather
 * than cached, so a long-lived session flips to the next holiday at the
 * city's own midnight without a refetch.
 */
export function useNextHoliday(
  enabled: boolean,
  timeZone: string | undefined,
): HolidayCountdown | undefined {
  // "Current year" is fixed per mount; the payload already contains next
  // year's list, so a session spanning New Year keeps working.
  const year = useMemo(() => new Date().getFullYear(), []);

  const { data: holidays } = useQuery<Holiday[]>({
    queryKey: ['holidays', 'HK', year],
    queryFn: async () => {
      const [current, next] = await Promise.all([fetchHolidays(year), fetchHolidays(year + 1)]);
      return [...current, ...next];
    },
    enabled,
    staleTime: Infinity,
  });

  // Re-derive "today" once a minute so isToday/daysUntil stay honest.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), MINUTE_MS);
    return () => clearInterval(id);
  }, []);

  const todayIso = timeZone ? todayIsoInZone(now, timeZone) : undefined;

  // Gate the result on `enabled` as well as on data: a disabled query still
  // serves previously cached HK holidays, and the badge must not follow the
  // user to a non-HK city on the strength of that cache.
  return useMemo(
    () =>
      enabled && holidays && todayIso
        ? (nextHoliday(holidays, todayIso) ?? undefined)
        : undefined,
    [enabled, holidays, todayIso],
  );
}
