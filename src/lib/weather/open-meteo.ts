/** Open-Meteo weather API client */

import { fetchWithTimeout } from '../fetch-utils';
import { logTiming, logFailure } from '../log';
import { TIMING } from '../constants';
import { WeatherData } from './types';
import { parseOpenMeteoForecast, logParseWarnings } from '../parsers';

/** Fetch current + forecast data from Open-Meteo. The raw response is
 *  passed through `parseOpenMeteoForecast` which validates every field with
 *  `typeof` and uses safe defaults for any drift; only a fundamentally
 *  unparseable response (not an object, or current/hourly/daily missing)
 *  throws. */
export async function getWeather(latitude: number, longitude: number): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day,uv_index',
    hourly: 'temperature_2m,weather_code,precipitation_probability,precipitation,wind_speed_10m,wind_direction_10m,is_day',
    minutely_15: 'precipitation',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant,sunrise,sunset',
    timezone: 'auto',
    forecast_days: '7',
    timeformat: 'unixtime',
  });

  const start = Date.now();
  let raw: unknown;
  try {
    const response = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?${params}`, { timeout: TIMING.OPEN_METEO_TIMEOUT_MS });
    if (!response.ok) throw new Error(`Failed to fetch weather: ${response.status}`);
    raw = await response.json();
    logTiming('Open-Meteo fetch', Date.now() - start);
  } catch (err) {
    logFailure('Weather fetch', Date.now() - start, err);
    throw err;
  }

  const { data, warnings } = parseOpenMeteoForecast(raw);
  logParseWarnings('Open-Meteo', warnings);
  if (!data) throw new Error('Open-Meteo: unparseable response');
  return data;
}