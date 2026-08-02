import { useEffect, useMemo, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { fetchWeather } from '@/lib/weather-manager';
import { WeatherData } from '@/lib/weather';
import { isInHongKong } from '@/lib/hko-weather';
import { TIMING } from '@/lib/constants';
import { makeCityId, readLastKnownWeather } from '@/lib/weather/storage';

export type LoadStatus = 'idle' | 'fetching' | 'success' | 'error';
export type LoadService = 'openMeteo' | 'hko';
export type LoadProgress = Record<LoadService, LoadStatus>;

/**
 * Wraps React Query for weather data with:
 *  - per-source loading progress (Open-Meteo + HKO)
 *  - cold-start seed from `localStorage` last-known snapshot (instant first paint)
 *  - faster refetch interval when the last fetch failed
 *  - augmentation of stale data with `fallbackSource: 'cache'` when the
 *    background fetch fails (so the UI can render the red offline banner)
 */
export function useWeatherWithProgress(
  latitude: number | undefined,
  longitude: number | undefined,
  language: 'en' | 'tc',
) {
  const [loadProgress, setLoadProgress] = useState<LoadProgress>({
    openMeteo: 'idle',
    hko: 'idle',
  });
  const [hasFailure, setHasFailure] = useState(false);

  // Cold-start seed: read the last-known snapshot synchronously on first
  // render and whenever the city changes. Forced stale so the background
  // fetch fires immediately.
  const initialData = useMemo<WeatherData | undefined>(() => {
    if (latitude === undefined || longitude === undefined) return undefined;
    const cityId = makeCityId(latitude, longitude);
    return readLastKnownWeather(cityId)?.data;
  }, [latitude, longitude]);

  const query = useQuery<WeatherData, Error, WeatherData, readonly unknown[]>({
    queryKey: ['weather-unified', language, latitude, longitude],
    queryFn: async () => {
      setLoadProgress({
        openMeteo: 'fetching',
        hko: isInHongKong(latitude!, longitude!) ? 'fetching' : 'idle',
      });
      return fetchWeather(
        latitude!,
        longitude!,
        language,
        (service, status) => {
          setLoadProgress(prev => ({ ...prev, [service]: status }));
        }
      );
    },
    enabled: latitude !== undefined && longitude !== undefined,
    refetchInterval: hasFailure ? TIMING.REFETCH_ON_FAILURE_MS : TIMING.REFETCH_INTERVAL_MS,
    staleTime: hasFailure ? TIMING.REFETCH_ON_FAILURE_MS : TIMING.STALE_TIME_MS,
    placeholderData: keepPreviousData,
    initialData,
    // Treat cold-start snapshot as immediately stale so the background fetch
    // fires without waiting for `staleTime` to elapse.
    initialDataUpdatedAt: initialData ? 0 : undefined,
  });

  // Augment cached-but-failed data with `fallbackSource: 'cache'`. When the
  // query is in error state but data exists (i.e. the rendered payload came
  // from the localStorage seed), surface that to the banner logic.
  const data = useMemo<WeatherData | undefined>(() => {
    if (!query.data) return query.data;
    if (!query.error) return query.data;
    if (query.data.fallbackSource) return query.data;
    return {
      ...query.data,
      isFallback: true,
      fallbackSource: 'cache',
    };
  }, [query.data, query.error]);

  // Track fallback/failure state so subsequent refreshes retry faster.
  useEffect(() => {
    if (query.data) {
      // Trigger fast cadence when any source has failed, or when the data is
      // a fully cached fallback. Relaxes back to healthy cadence on success.
      const omOk = query.data.sources?.om?.ok !== false;
      const hkoOk = query.data.sources?.hko?.ok !== false;
      const allOk = omOk && hkoOk;
      setHasFailure(!allOk || !!query.data.isFallback);
    } else {
      setHasFailure(false);
    }
  }, [query.data]);

  return { ...query, data, loadProgress, hasFailure };
}