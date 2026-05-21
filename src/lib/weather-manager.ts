import { cache } from './cache';
import { getWeather as getOpenMeteoWeather, WeatherData } from './weather';
import { isInHongKong, getHKODailyAndWarnings, fetchHKOWeatherData } from './hko-weather';

const WEATHER_CACHE_TTL = 1000 * 60 * 10; // 10 mins

export async function fetchWeather(lat: number, lon: number, lang: 'en' | 'tc' = 'en'): Promise<WeatherData> {
  const cacheKey = `weather_combined_${lat}_${lon}_${lang}`;
  
  // Try normal cache first (non-expired)
  const cached = cache.get<WeatherData>(cacheKey, WEATHER_CACHE_TTL);
  if (cached) return cached;

  if (isInHongKong(lat, lon)) {
    // Hybrid: Open-Meteo for hourly/current, HKO for warnings/daily
    // We fetch both in parallel, but HKO is treated as an enhancement
    try {
      const omPromise = getOpenMeteoWeather(lat, lon);
      const hkoPromise = getHKODailyAndWarnings(lang, lat, lon).catch(err => {
        console.warn('HKO data enhancement failed, falling back to Open-Meteo only:', err);
        return null;
      });

      const [omData, hkoData] = await Promise.all([omPromise, hkoPromise]);

      if (!hkoData) {
        cache.set(cacheKey, omData);
        return omData;
      }

      const combined: WeatherData = {
        ...omData,
        daily: hkoData.daily.map((day, i) => ({
          ...day,
          // HKO doesn't provide sun times, so we use Open-Meteo's
          sunrise: omData.daily[i]?.sunrise || day.sunrise,
          sunset: omData.daily[i]?.sunset || day.sunset,
        })),
        warnings: hkoData.warnings,
        nearestStation: hkoData.nearestStation,
        nearestDistrict: hkoData.nearestDistrict,
      };

      cache.set(cacheKey, combined);
      return combined;
    } catch (err) {
      console.error('Unified fetch failed, attempting HKO fallback for HK region:', err);
      try {
        const hkoData = await fetchHKOWeatherData(lat, lon, lang);
        // Cache fallback data for 5 minutes instead of 10 to encourage recovery attempts
        cache.set(cacheKey, hkoData);
        return hkoData;
      } catch (hkoErr) {
        console.error('HKO fallback failed too:', hkoErr);
      }
    }
  } else {
    // Global fallback
    try {
      const data = await getOpenMeteoWeather(lat, lon);
      cache.set(cacheKey, data);
      return data;
    } catch (err) {
      console.error('Open-Meteo fetch failed for non-HK region:', err);
    }
  }

  // Fallback to expired cache if API calls failed
  const rawCached = cache.getRaw<WeatherData>(cacheKey);
  if (rawCached && rawCached.data) {
    console.log('Using expired cache as last resort fallback');
    return {
      ...rawCached.data,
      isFallback: true,
      fallbackSource: 'cache',
    };
  }

  // If even cache is not found, throw error
  throw new Error('All weather API requests and cache fallbacks failed');
}

