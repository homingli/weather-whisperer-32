import { getWeather as getOpenMeteoWeather, WeatherData } from './weather';
import { isInHongKong, getHKODailyAndWarnings, fetchHKOWeatherData } from './hko-weather';

function isTimeoutError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'TimeoutError';
}

export async function fetchWeather(
  lat: number,
  lon: number,
  lang: 'en' | 'tc' = 'en',
  onProgress?: (service: 'openMeteo' | 'hko', status: 'fetching' | 'success' | 'error') => void
): Promise<WeatherData> {
  // 1. Fetch Open-Meteo
  let omData: WeatherData | null = null;
  onProgress?.('openMeteo', 'fetching');
  try {
    omData = await getOpenMeteoWeather(lat, lon);
    onProgress?.('openMeteo', 'success');
  } catch (err) {
    console.warn('Open-Meteo fetch failed:', err);
    onProgress?.('openMeteo', 'error');
  }

  // 2. HKO path or non-HK path
  if (isInHongKong(lat, lon)) {
    if (!omData) {
      // Open-Meteo failed, do HKO fallback only
      console.log('Open-Meteo failed. Attempting HKO fallback.');
      onProgress?.('hko', 'fetching');
      try {
        const hkoFallbackData = await fetchHKOWeatherData(lat, lon, lang);
        onProgress?.('hko', 'success');
        return hkoFallbackData;
      } catch (err) {
        onProgress?.('hko', 'error');
        console.error('HKO fallback failed too:', err);
        // React Query will surface the error; caller handles fallback UI
        throw new Error('Both Open-Meteo and HKO APIs failed');
      }
    }

    // Normal path: combine Open-Meteo with HKO
    let hkoData: { daily: any; warnings: any; nearestStation?: string; nearestDistrict?: string; timezone?: string } | null = null;
    let hkoFailed = false;

    onProgress?.('hko', 'fetching');
    try {
      hkoData = await getHKODailyAndWarnings(lang, lat, lon);
      onProgress?.('hko', 'success');
    } catch (err) {
      console.warn('HKO fetch failed:', err);
      onProgress?.('hko', 'error');
      // Stale cache recovery on timeout only
      if (isTimeoutError(err)) {
        // React Query's keepPreviousData handles stale UI; don't fall back to stale here
      }
      hkoFailed = true;
    }

    if (hkoFailed) {
      return {
        ...omData,
        hkoFailed: true,
      };
    }

    // Combine Open-Meteo with HKO daily/warnings
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

    return combined;
  } else {
    // Non-HK region: only Open-Meteo
    onProgress?.('hko', 'error'); // Not applicable
    if (omData) {
      return omData;
    }
    throw new Error('Open-Meteo API failed');
  }
}
