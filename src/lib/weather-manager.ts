import { cache } from './cache';
import { getWeather as getOpenMeteoWeather, WeatherData } from './weather';
import { isInHongKong } from './hko-weather';
import { getHKODailyAndWarnings } from './hko-weather';

const WEATHER_CACHE_TTL = 1000 * 60 * 10; // 10 mins

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
      daily: hkoData.daily.map((day, i) => ({
        ...day,
        // HKO doesn't provide sun times, so we use Open-Meteo's
        sunrise: omData.daily[i]?.sunrise || day.sunrise,
        sunset: omData.daily[i]?.sunset || day.sunset,
      })),
      nearestStation: hkoData.nearestStation,
      nearestDistrict: hkoData.nearestDistrict,
    };

    cache.set(cacheKey, combined);
    return combined;
  }

  // Global fallback
  const data = await getOpenMeteoWeather(lat, lon);
  cache.set(cacheKey, data);
  return data;
}
