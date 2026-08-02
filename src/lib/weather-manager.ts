import { getWeather as getOpenMeteoWeather, WeatherData, DailyForecast } from './weather';
import { isInHongKong, getHKODailyAndWarnings, getHKOCurrentWeather, buildHKOWeatherData, fetchHKOWeatherData } from './hko-weather';
import type { HKOCurrentWeatherResponse } from './hko-types';
import { SourceState, SourceId } from './weather/types';
import { logWarn, logError } from './log';
import { TIMING } from './constants';
import { makeCityId, writeLastKnownWeather } from './weather/storage';

/**
 * Unified weather gateway. Parallel fetches, fallback chain, per-source
 * freshness tracking. On any successful fetch, persists the result as the
 * cold-start seed for the next mount (see `writeLastKnownWeather`).
 *
 * `fallbackSource` semantics:
 *   - undefined  : both sources live
 *   - 'HKO'      : OM unavailable, HKO-only fallback path produced the data
 *   - 'partial'  : one source live, the other failed
 *   - 'cache'    : not set here — owned by the hook when query errored but
 *                  initialData from localStorage is rendered
 */
export async function fetchWeather(
  lat: number,
  lon: number,
  lang: 'en' | 'tc' = 'en',
  onProgress?: (service: 'openMeteo' | 'hko', status: 'fetching' | 'success' | 'error') => void
): Promise<WeatherData> {
  const cityId = makeCityId(lat, lon);
  const isHK = isInHongKong(lat, lon);
  const now = Date.now();

  // Source-specific TTLs. OM's most-volatile slice is current/hourly (5min).
  // HKO's most-volatile slice is warnings (1min).
  const omTtl = TIMING.STALE_TIME_MS;
  const hkoTtl = TIMING.HKO_WARNINGS_TTL_MS;

  // Start both fetches in parallel — Open-Meteo primary, HKO secondary
  onProgress?.('openMeteo', 'fetching');
  if (isHK) onProgress?.('hko', 'fetching');

  const [omResult, hkoResult, hkoCurrentResult] = await Promise.all([
    (async () => {
      try {
        const data = await getOpenMeteoWeather(lat, lon);
        onProgress?.('openMeteo', 'success');
        return { data, error: null as Error | null };
      } catch (err) {
        logWarn('Open-Meteo fetch failed', err);
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
            logWarn('HKO fetch failed', err);
            onProgress?.('hko', 'error');
            return { data: null, error: err as Error };
          }
        })()
      : (async () => {
          onProgress?.('hko', 'error'); // Not applicable
          return { data: null, error: null as Error | null };
        })(),
    isHK
      ? (async () => {
          try {
            const data = await getHKOCurrentWeather(lang);
            return { data, error: null as Error | null };
          } catch (err) {
            // Non-fatal: the merged path falls back to OM current if HKO
            // current is unavailable. Only the legacy HKO-only fallback
            // path requires this fetch (handled separately below).
            logWarn('HKO current weather fetch failed', err);
            return { data: null as HKOCurrentWeatherResponse | null, error: err as Error };
          }
        })()
      : (async () => ({ data: null as HKOCurrentWeatherResponse | null, error: null as Error | null }))(),
  ]);

  const omOk = !!omResult.data;
  const hkoOk = !!hkoResult.data;
  const omData = omResult.data;
  const hkoErr = hkoResult.error;

  const omSource: SourceState = {
    ok: omOk,
    cachedAt: omOk ? now : 0,
    ttlMs: omTtl,
    isExpired: !omOk, // cachedAt=0 always > TTL
  };
  const hkoSource: SourceState = {
    ok: hkoOk,
    cachedAt: hkoOk ? now : 0,
    ttlMs: hkoTtl,
    isExpired: !hkoOk,
  };

  /** Build the sources field for a non-HK or partial result. */
  function attachOmOnly(data: WeatherData): WeatherData {
    return { ...data, sources: { om: omSource } };
  }

  /** Persist the snapshot and return the data unchanged. */
  function persist(data: WeatherData): WeatherData {
    writeLastKnownWeather(cityId, lang, data);
    return data;
  }

  // Non-HK path: Open-Meteo only
  if (!isHK) {
    if (omData) return persist(attachOmOnly(omData));
    throw new Error('Open-Meteo API failed');
  }

  // HK path
  if (!omOk && !hkoOk) {
    // Both failed — try HKO-only fallback
    logWarn('Open-Meteo failed. Attempting HKO fallback.');
    onProgress?.('hko', 'fetching');
    try {
      const hkoFallbackData = await fetchHKOWeatherData(lat, lon, lang);
      onProgress?.('hko', 'success');
      // HKO-only fallback succeeded; OM still failed.
      const hkoNow: SourceState = {
        ok: true,
        cachedAt: Date.now(),
        ttlMs: hkoTtl,
        isExpired: false,
      };
      const result: WeatherData = {
        ...hkoFallbackData,
        sources: { om: omSource, hko: hkoNow },
        isFallback: true,
        fallbackSource: 'HKO',
      };
      return persist(result);
    } catch (err) {
      onProgress?.('hko', 'error');
      logError('HKO fallback failed too', err);
      throw new Error('Both Open-Meteo and HKO APIs failed');
    }
  }

  if (!omOk && hkoOk) {
    // Open-Meteo failed, HKO daily succeeded — fetch only HKO current weather,
    // merge with already-parsed daily data (avoids re-fetching daily/warnings).
    // This is the legacy "HKO carries the show" path → fallbackSource: 'HKO'.
    const hkoDailyData = hkoResult.data!;
    onProgress?.('hko', 'fetching');
    try {
      const hkoCurrent = await getHKOCurrentWeather(lang);
      onProgress?.('hko', 'success');
      const merged = await buildHKOWeatherData(hkoCurrent, hkoDailyData, lat, lon, lang);
      const hkoNow: SourceState = {
        ok: true,
        cachedAt: Date.now(),
        ttlMs: hkoTtl,
        isExpired: false,
      };
      const result: WeatherData = {
        ...merged,
        sources: { om: omSource, hko: hkoNow },
        isFallback: true,
        fallbackSource: 'HKO',
      };
      return persist(result);
    } catch (err) {
      onProgress?.('hko', 'error');
      logError('HKO fallback failed too', err);
      throw new Error('Both Open-Meteo and HKO APIs failed');
    }
  }

  if (hkoErr) {
    // OM succeeded, HKO failed — return OM with hkoFailed flag. One source
    // live (OM), one failed (HKO) → fallbackSource: 'partial'.
    // isExpiredCache here reflects only the cached (HKO) source's expiry
    // — OM is live and contributes no TTL-bounded data, so checking only
    // the cached side is the correct semantic.
    const result: WeatherData = {
      ...omData!,
      sources: { om: omSource, hko: hkoSource },
      isFallback: true,
      fallbackSource: 'partial',
      isExpiredCache: hkoSource.isExpired,
      hkoFailed: true,
    };
    return persist(result);
  }

  // Both succeeded — combine. HKO wins for daily (with OM sunrise/sunset
  // preserved) and supplies warnings/station/district; HKO also wins for the
  // current temperature when its current-weather fetch succeeds (the today
  // temperature bar / marker uses this value). OM keeps current/hourly for
  // everything else.
  const hkoData = hkoResult.data!;
  const hkoNow: SourceState = {
    ok: true,
    cachedAt: Date.now(),
    ttlMs: hkoTtl,
    isExpired: false,
  };

  // Extract the HKO current temperature from the matching station (or the
  // first reading as a fallback) when the HKO current fetch succeeded.
  const hkoCurrentData = hkoCurrentResult.data;
  const hkoTempReading =
    hkoCurrentData?.temperature.data.find((t) => t.place === hkoData.nearestStation) ||
    hkoCurrentData?.temperature.data[0];
  const hkoCurrentTemperature = hkoTempReading?.value;

  // HKO seeds sunrise/sunset with epoch-0 sentinels (HKO daily doesn't publish
  // sun times); replace any invalid date with the OM value so the chart's
  // sunrise/sunset markers don't render at 1970.
  const isValidDate = (d: Date | undefined | null): d is Date =>
    d instanceof Date && !isNaN(d.getTime()) && d.getTime() > 0;

  const merged: WeatherData = {
    ...omData!,
    current: hkoCurrentTemperature != null
      ? { ...omData!.current, temperature: hkoCurrentTemperature }
      : omData!.current,
    daily: (hkoData.daily ?? []).filter(Boolean).map((day: DailyForecast, i: number) => {
      const omSunrise = omData!.daily[i]?.sunrise;
      const omSunset = omData!.daily[i]?.sunset;
      return {
        ...day,
        sunrise: isValidDate(day.sunrise) ? day.sunrise : (isValidDate(omSunrise) ? omSunrise : day.sunrise),
        sunset: isValidDate(day.sunset) ? day.sunset : (isValidDate(omSunset) ? omSunset : day.sunset),
      };
    }),
    warnings: hkoData.warnings,
    nearestStation: hkoData.nearestStation,
    nearestDistrict: hkoData.nearestDistrict,
    sources: { om: omSource, hko: hkoNow },
  };
  return persist(merged);
}

// Re-export for downstream consumers that need the type
export type { SourceState, SourceId };