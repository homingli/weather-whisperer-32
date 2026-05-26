import { cache } from './cache';
import { getWeather as getOpenMeteoWeather, WeatherData } from './weather';
import { isInHongKong, getHKODailyAndWarnings, fetchHKOWeatherData } from './hko-weather';

const WEATHER_CACHE_TTL = 1000 * 60 * 5; // 5 mins

export async function fetchWeather(
  lat: number,
  lon: number,
  lang: 'en' | 'tc' = 'en',
  onProgress?: (service: 'openMeteo' | 'hko', status: 'fetching' | 'success' | 'error' | 'cached') => void
): Promise<WeatherData> {
  let omData: any = null;
  let omSuccess = false;

  const combinedCacheKey = `weather_combined_${lat}_${lon}_${lang}`;

  // 1. Open-Meteo cache & fetch
  const omCacheKey = `weather_openmeteo_${lat}_${lon}`;
  const cachedOm = cache.get<any>(omCacheKey, WEATHER_CACHE_TTL);

  if (cachedOm) {
    console.log(`[Cache Hit] Open-Meteo data loaded from cache for ${lat}, ${lon}`);
    onProgress?.('openMeteo', 'cached');
    omData = cachedOm;
    omSuccess = true;
  } else {
    console.log(`[Network Fetch] Open-Meteo data fetched from API for ${lat}, ${lon}`);
    onProgress?.('openMeteo', 'fetching');
    try {
      omData = await getOpenMeteoWeather(lat, lon);
      cache.set(omCacheKey, omData);
      onProgress?.('openMeteo', 'success');
      omSuccess = true;
    } catch (err) {
      console.warn('Open-Meteo fetch failed:', err);
      onProgress?.('openMeteo', 'error');
    }
  }

  // 2. HKO fetch or fallback if needed
  if (isInHongKong(lat, lon)) {
    if (!omSuccess) {
      // Open-Meteo failed, do HKO fallback only
      console.log('Open-Meteo failed. Attempting HKO fallback.');
      onProgress?.('hko', 'fetching');
      try {
        const hkoFallbackData = await fetchHKOWeatherData(lat, lon, lang);
        // Cache fallback data for 1 minute (60000ms)
        cache.set(combinedCacheKey, hkoFallbackData, 60 * 1000);
        onProgress?.('hko', 'success');
        return hkoFallbackData;
      } catch (err) {
        onProgress?.('hko', 'error');
        console.error('HKO fallback failed too:', err);
      }
    } else {
      // Normal path: combine Open-Meteo with HKO
      const hkoCacheKey = `weather_hko_${lat}_${lon}_${lang}`;
      let hkoData = cache.get<any>(hkoCacheKey, WEATHER_CACHE_TTL);

      if (hkoData) {
        console.log(`[Cache Hit] HKO data loaded from cache for ${lat}, ${lon} (${lang})`);
        onProgress?.('hko', 'cached');
      } else {
        console.log(`[Network Fetch] HKO data fetched from API for ${lat}, ${lon} (${lang})`);
        onProgress?.('hko', 'fetching');
        try {
          hkoData = await getHKODailyAndWarnings(lang, lat, lon);
          cache.set(hkoCacheKey, hkoData);
          onProgress?.('hko', 'success');
        } catch (err) {
          console.warn('HKO fetch failed:', err);
          onProgress?.('hko', 'error');
        }
      }

      if (!hkoData) {
        const fallbackData = {
          ...omData,
          hkoFailed: true,
        };
        // Cache fallback data for 1 minute (60000ms)
        cache.set(combinedCacheKey, fallbackData, 60 * 1000);
        return fallbackData;
      }

      const combined: WeatherData = {
        ...omData,
        daily: hkoData.daily.map((day: any, i: number) => ({
          ...day,
          sunrise: omData.daily[i]?.sunrise || day.sunrise,
          sunset: omData.daily[i]?.sunset || day.sunset,
        })),
        warnings: hkoData.warnings,
        nearestStation: hkoData.nearestStation,
        nearestDistrict: hkoData.nearestDistrict,
      };

      // Cache combined data under old key
      cache.set(combinedCacheKey, combined);
      return combined;
    }
  } else {
    // Non-HK region
    onProgress?.('hko', 'cached'); // Immediate ready/cached
    if (omSuccess) {
      // Cache combined data under old key
      const combined = { ...omData };
      cache.set(combinedCacheKey, combined);
      return combined;
    }
  }

  // Fallback to expired cache if API calls failed
  const rawCached = cache.getRaw<WeatherData>(combinedCacheKey);
  if (rawCached && rawCached.data) {
    console.log('Using expired cache as last resort fallback');
    return {
      ...rawCached.data,
      isFallback: true,
      fallbackSource: 'cache',
    };
  }

  throw new Error('All weather API requests and cache fallbacks failed');
}

