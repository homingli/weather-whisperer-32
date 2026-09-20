import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { searchCities } from '@/lib/weather';
import type { GeoLocation } from '@/lib/weather';

/**
 * React Query wrapper around `searchCities`. Wrapping in useQuery gives us:
 *  - 7-day `staleTime`: repeated searches for the same city string (e.g.
 *    a user retyping) don't re-hit the geocoding API for a week.
 *  - `keepPreviousData`: switching from one query string to the next shows
 *    the prior results while the new ones load, instead of clearing the
 *    dropdown and showing a spinner.
 *  - `enabled` gate (length >= 2): matches `searchCities` internal guard
 *    and skips even an in-flight key when the input is shorter.
 *  - Automatic request cancellation on keystroke via React Query v5.
 */

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

export function useCitySearch(query: string): {
  data: GeoLocation[];
  isFetching: boolean;
  isPlaceholderData: boolean;
} {
  const trimmed = query.trim();
  const enabled = trimmed.length >= 2;

  const { data, isFetching, isPlaceholderData } = useQuery<GeoLocation[]>({
    queryKey: ['geocode', trimmed],
    queryFn: () => searchCities(trimmed),
    enabled,
    staleTime: SEVEN_DAYS,
    placeholderData: keepPreviousData,
  });

  // `data` is only surfaced when the query is enabled. Cached results
  // survive in React Query's internal cache for `gcTime` (default 5 min)
  // even when `enabled` flips false — e.g. user types "Lon" then
  // backspaces to "L", the cache still holds "London" but the consumer
  // should not see it under a 1-char query. Gate by `enabled` so the
  // dropdown clears on every disable transition; keepPreviousData still
  // works within active queries because that path stays enabled.
  return {
    data: enabled ? (data ?? []) : [],
    isFetching,
    isPlaceholderData,
  };
}
