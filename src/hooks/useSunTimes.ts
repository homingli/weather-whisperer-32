import { useMemo } from 'react';
import { getSunTimes, getZoneOffsetMinutes, type SunTimes } from '@/lib/solar-times';

export interface UseSunTimesResult {
  /**
   * Sun times for the location's local calendar day, `dayOffset` days from
   * now (0 = today, 1 = tomorrow). Uses the payload timezone when available,
   * device zone before the first fetch succeeds. Null fields = polar
   * day/night or no location selected.
   */
  getSunTimesFor: (dayOffset: number) => SunTimes;
}

const NO_SUN_TIMES: SunTimes = { sunrise: null, sunset: null };

/**
 * Local sunrise/sunset for the selected city (see solar-times.ts for why
 * this is computed rather than read from the weather payload). The memoized
 * closure reads Date.now() per call, so values stay fresh across re-renders
 * without a ticking state of their own — consumers that need sub-tick
 * freshness (sun-cycle strip) already run their own minute interval.
 */
export function useSunTimes(
  latitude?: number,
  longitude?: number,
  timezone?: string,
): UseSunTimesResult {
  return useMemo(() => ({
    getSunTimesFor: (dayOffset: number): SunTimes => {
      if (latitude == null || longitude == null) return NO_SUN_TIMES;
      const at = new Date(Date.now() + dayOffset * 86_400_000);
      const tzOffset = getZoneOffsetMinutes(timezone, at);
      return getSunTimes(latitude, longitude, at, tzOffset);
    },
  }), [latitude, longitude, timezone]);
}
