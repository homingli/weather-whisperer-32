import { cache } from './cache';
import { getWeather as getOpenMeteoWeather, WeatherData, isInHongKong } from './weather';
import { getHKODailyAndWarnings } from './hko-weather';

const WEATHER_CACHE_TTL = 1000 * 60 * 30; // 30 mins

export async function fetchWeather(lat: number, lon: number, lang: 'en' | 'tc' = 'en'): Promise<WeatherData> {
  const cacheKey = `weather_combined_${lat}_${lon}_${lang}`;
  const cached = cache.get<WeatherData>(cacheKey, WEATHER_CACHE_TTL);
  if (cached) return cached;

  if (isInHongKong(lat, lon)) {
    // Hybrid: Open-Meteo for hourly/current, HKO for warnings/daily
    const [omData, hkoData] = await Promise.all([
      getOpenMeteoWeather(lat, lon),
      getHKODailyAndWarnings(lang, lat, lon),
    ]);

    const combined: WeatherData = {
      ...omData,
      daily: hkoData.daily, // Prefer HKO daily for higher accuracy in HK
    };

    cache.set(cacheKey, combined);
    return combined;
  }

  // Global fallback
  const data = await getOpenMeteoWeather(lat, lon);
  cache.set(cacheKey, data);
  return data;
}
