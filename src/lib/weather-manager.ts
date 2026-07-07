import { getWeather as getOpenMeteoWeather, WeatherData } from './weather';
import { isInHongKong, getHKODailyAndWarnings, getHKOCurrentWeather, buildHKOWeatherData } from './hko-weather';
import { logWarn, logError } from './log';

export async function fetchWeather(
  lat: number,
  lon: number,
  lang: 'en' | 'tc' = 'en',
  onProgress?: (service: 'openMeteo' | 'hko', status: 'fetching' | 'success' | 'error') => void
): Promise<WeatherData> {
  const isHK = isInHongKong(lat, lon);

  // Start both fetches in parallel — Open-Meteo primary, HKO secondary
  onProgress?.('openMeteo', 'fetching');
  if (isHK) onProgress?.('hko', 'fetching');

  const [omResult, hkoResult] = await Promise.all([
    (async () => {
      try {
        const data = await getOpenMeteoWeather(lat, lon);
        onProgress?.('openMeteo', 'success');
        return { data, error: null as Error | null };
      } catch (err) {
        logWarn('Open-Meteo fetch failed:', err);
        onProgress?.('openMeteo', 'error');
        return { data: null as WeatherData | null, error: err as Error };
      }
    })(),
    isHK
      ? (async () => {
          try {
            const data = await getHKODailyAndWarnings(lang, lat, lon);
            onProgress?.('hko', 'success');
            return { data, error: null as Error | null };
          } catch (err) {
            logWarn('HKO fetch failed:', err);
            onProgress?.('hko', 'error');
            return { data: null, error: err as Error };
          }
        })()
      : (async () => {
          onProgress?.('hko', 'error'); // Not applicable
          return { data: null, error: null as Error | null };
        })(),
  ]);

  const omData = omResult.data;
  const hkoErr = hkoResult.error;

  // Non-HK path: Open-Meteo only
  if (!isHK) {
    if (omData) return omData;
    throw new Error('Open-Meteo API failed');
  }

  // HK path
  if (!omData && !hkoResult.data) {
    // Both failed — try HKO-only fallback
    logWarn('Open-Meteo failed. Attempting HKO fallback.');
    onProgress?.('hko', 'fetching');
    try {
      const hkoFallbackData = await fetchHKOWeatherData(lat, lon, lang);
      onProgress?.('hko', 'success');
      return hkoFallbackData;
    } catch (err) {
      onProgress?.('hko', 'error');
      logError('HKO fallback failed too:', err);
      throw new Error('Both Open-Meteo and HKO APIs failed');
    }
  }

  if (!omData && hkoResult.data) {
    // Open-Meteo failed, HKO daily succeeded — fetch only HKO current weather,
    // merge with already-parsed daily data (avoids re-fetching daily/warnings)
    onProgress?.('hko', 'fetching');
    try {
      const hkoCurrent = await getHKOCurrentWeather(lang);
      onProgress?.('hko', 'success');
      return buildHKOWeatherData(hkoCurrent, hkoResult.data, lat, lon, lang);
    } catch (err) {
      onProgress?.('hko', 'error');
      logError('HKO fallback failed too:', err);
      throw new Error('Both Open-Meteo and HKO APIs failed');
    }
  }

  if (hkoErr) {
    // OM succeeded, HKO failed — return OM with hkoFailed flag
    return { ...omData, hkoFailed: true };
  }

  // Both succeeded — combine
  const hkoData = hkoResult.data!;
  return {
    ...omData,
    daily: (hkoData.daily ?? []).filter(Boolean).map((day: any, i: number) => ({
      ...day,
      sunrise: omData.daily[i]?.sunrise || day.sunrise,
      sunset: omData.daily[i]?.sunset || day.sunset,
    })),
    warnings: hkoData.warnings,
    nearestStation: hkoData.nearestStation,
    nearestDistrict: hkoData.nearestDistrict,
  };
}
