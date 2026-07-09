import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchWeather } from '@/lib/weather-manager';
import { WeatherData } from '@/lib/weather';
import { isInHongKong } from '@/lib/hko-weather';
import { TIMING } from '@/lib/constants';

export type LoadStatus = 'idle' | 'fetching' | 'success' | 'error';
export type LoadService = 'openMeteo' | 'hko';
export type LoadProgress = Record<LoadService, LoadStatus>;

/**
 * Wraps React Query for weather data with per-source loading progress
 * (Open-Meteo + HKO) and a faster refetch interval when the last fetch
 * failed.
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

  const query = useQuery<WeatherData>({
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
    placeholderData: 'keepPreviousData',
  });

  // Track fallback/failure state so subsequent refreshes retry faster.
  useEffect(() => {
    if (query.data) {
      setHasFailure(!!(query.data.hkoFailed || query.data.isFallback));
    } else {
      setHasFailure(false);
    }
  }, [query.data]);

  return { ...query, loadProgress, hasFailure };
}
