/** Open-Meteo weather API client */

import { fetchWithTimeout } from '../fetch-utils';
import { logTiming, logFailure } from '../log';
import { TIMING } from '../constants';
import { WeatherData } from './types';

/** Fetch current + forecast data from Open-Meteo */
export async function getWeather(latitude: number, longitude: number): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day,uv_index',
    hourly: 'temperature_2m,weather_code,precipitation_probability,precipitation,wind_speed_10m,wind_direction_10m,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant,sunrise,sunset',
    timezone: 'auto',
    forecast_days: '7',
    timeformat: 'unixtime',
  });

  const start = Date.now();
  let data;
  try {
    const response = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?${params}`, { timeout: TIMING.OPEN_METEO_TIMEOUT_MS });
    if (!response.ok) throw new Error(`Failed to fetch weather: ${response.status}`);
    data = await response.json();
    logTiming('Open-Meteo fetch', Date.now() - start);
  } catch (err) {
    logFailure('Weather fetch', Date.now() - start, err);
    throw err;
  }

  // With unixtime, data.current.time and data.hourly.time are numbers (Unix seconds).
  // Finding the current hour index is now a simple numeric comparison.
  const nowUnix = Math.floor(Date.now() / 1000);

  const currentHourIndex = data.hourly.time.findIndex((t: number) => {
    return nowUnix >= t && nowUnix < t + 3600;
  });

  const startIndex = currentHourIndex >= 0 ? currentHourIndex : 0;

  const currentPrecipProb = startIndex >= 0
    ? data.hourly.precipitation_probability[startIndex]
    : 0;

  return {
    current: {
      temperature: data.current.temperature_2m,
      apparentTemperature: data.current.apparent_temperature,
      humidity: data.current.relative_humidity_2m,
      uvIndex: data.current.uv_index,
      weatherCode: data.current.weather_code,
      windSpeed: data.current.wind_speed_10m,
      windDirection: data.current.wind_direction_10m,
      precipitation: data.current.precipitation ?? 0,
      precipitationProbability: currentPrecipProb,
      isDay: data.current.is_day === 1,
    },
    hourly: data.hourly.time.slice(startIndex, startIndex + 13).map((time: number, i: number) => ({
      time: new Date(time * 1000),
      temperature: data.hourly.temperature_2m[startIndex + i],
      weatherCode: data.hourly.weather_code[startIndex + i],
      windSpeed: data.hourly.wind_speed_10m[startIndex + i],
      windDirection: data.hourly.wind_direction_10m[startIndex + i],
      precipitationProbability: data.hourly.precipitation_probability[startIndex + i] ?? 0,
      precipitation: data.hourly.precipitation[startIndex + i] ?? 0,
      isDay: data.hourly.is_day[startIndex + i] === 1,
    })),
    daily: data.daily.time.map((time: number, i: number) => ({
      date: new Date(time * 1000),
      temperatureMax: data.daily.temperature_2m_max[i],
      temperatureMin: data.daily.temperature_2m_min[i],
      weatherCode: data.daily.weather_code[i],
      windSpeedMax: data.daily.wind_speed_10m_max[i],
      windDirectionDominant: data.daily.wind_direction_10m_dominant[i],
      precipitationProbabilityMax: data.daily.precipitation_probability_max[i],
      sunrise: new Date(data.daily.sunrise[i] * 1000),
      sunset: new Date(data.daily.sunset[i] * 1000),
    })),
    timezone: data.timezone,
  };
}