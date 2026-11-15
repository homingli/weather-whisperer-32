import { useEffect, useMemo, useState } from 'react';
import { getSunTimes, getZoneOffsetMinutes, type SunTimes } from '@/lib/solar-times';

export interface UseSunTimesResult {
  /** Memoized today/tomorrow pair — pass these as props, not fresh calls:
   *  per-render Date objects would defeat memo() on the consumers. */
  todaySun: SunTimes;
  tomorrowSun: SunTimes;
}

const NO_SUN_TIMES: SunTimes = { sunrise: null, sunset: null };

function computeSunTimes(
  latitude: number | undefined,
  longitude: number | undefined,
  timezone: string | undefined,
  dayOffset: number,
  nowMs: number,
): SunTimes {
  if (latitude == null || longitude == null) return NO_SUN_TIMES;
  const at = new Date(nowMs + dayOffset * 86_400_000);
  const tzOffset = getZoneOffsetMinutes(timezone, at);
  return getSunTimes(latitude, longitude, at, tzOffset);
}

const minuteBucket = (): number => Math.floor(Date.now() / 60_000);

/**
 * Local sunrise/sunset for the selected city (see solar-times.ts for why
 * this is computed rather than read from the weather payload). The memoized
 * pair is keyed on a minute bucket (refreshed by a 15 s interval) so a page
 * left open recomputes across minute/day boundaries (the pair rolls over at
 * the location's local midnight) while staying referentially stable within
 * a minute — per-render fresh Date objects would defeat memo() on consumers.
 */
export function useSunTimes(
  latitude?: number,
  longitude?: number,
  timezone?: string,
): UseSunTimesResult {
  const [minuteTick, setMinuteTick] = useState(minuteBucket);

  useEffect(() => {
    const id = setInterval(() => {
      const bucket = minuteBucket();
      setMinuteTick((prev) => (prev === bucket ? prev : bucket));
    }, 15_000);
    return () => clearInterval(id);
  }, []);

  const todaySun = useMemo(
    () => computeSunTimes(latitude, longitude, timezone, 0, minuteTick * 60_000),
    [latitude, longitude, timezone, minuteTick],
  );
  const tomorrowSun = useMemo(
    () => computeSunTimes(latitude, longitude, timezone, 1, minuteTick * 60_000),
    [latitude, longitude, timezone, minuteTick],
  );

  return { todaySun, tomorrowSun };
}
