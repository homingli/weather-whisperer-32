/** HKO data fetching and building functions */

import { CurrentWeather, DailyForecast, HourlyForecast, WeatherData } from './weather';
import { HKOCurrentWeatherResponse, HKOForecastResponse, HKOWarning, HKOWarningInfoResponse, HKOWarningSummaryResponse } from './hko-types';
import { findNearestStation, findNearestDistrict } from './hko-stations';
import { normalizePsr, psrToPercentage } from './hko-psr';
import { hkoIconToWeatherCode } from './hko-icons';
import { fetchWithTimeout } from './fetch-utils';
import { logTiming, logFailure } from './log';
import { TIMING } from './constants';

const HKO_API_BASE = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php';

/** Generic HKO API fetcher with consistent timeout, logging, and error handling */
async function hkoFetch<T>(dataType: string, lang: 'en' | 'tc'): Promise<T> {
  const start = Date.now();
  try {
    const response = await fetchWithTimeout(`${HKO_API_BASE}?dataType=${dataType}&lang=${lang}`, { timeout: TIMING.HKO_TIMEOUT_MS });
    if (!response.ok) throw new Error(`Failed to fetch HKO ${dataType}: ${response.status}`);
    const data = await response.json();
    logTiming(`HKO ${dataType} fetch`, Date.now() - start);
    return data;
  } catch (err) {
    logFailure(`HKO ${dataType}`, Date.now() - start, err);
    throw err;
  }
}

/** Parse YYYYMMDD date string from HKO API into a Date at HK midnight */
function parseHkoDate(dateStr: string): Date {
  if (!dateStr || dateStr.length !== 8) {
    throw new Error(`Invalid HKO date format: ${dateStr}. Expected YYYYMMDD format.`);
  }

  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(4, 6)) - 1;
  const dayOfMonth = Number(dateStr.slice(6, 8));

  if (isNaN(year) || isNaN(month) || isNaN(dayOfMonth)) {
    throw new Error(`Invalid date numbers in HKO date: ${dateStr}`);
  }

  const utcRef = Date.UTC(year, month, dayOfMonth, 12, 0, 0, 0);
  const hkOffset = 8 * 60 * 60 * 1000;
  const date = new Date(utcRef - 12 * 60 * 60 * 1000 - hkOffset);

  if (isNaN(date.getTime())) {
    throw new Error(`Failed to create valid date from HKO date: ${dateStr}`);
  }

  return date;
}

// --- Public fetch functions (delegating to hkoFetch) ---

export async function getHKOForecast(lang: 'en' | 'tc' = 'en'): Promise<HKOForecastResponse> {
  return hkoFetch<HKOForecastResponse>('fnd', lang);
}

export async function getHKOWarningSummary(lang: 'en' | 'tc' = 'en'): Promise<HKOWarningSummaryResponse> {
  return hkoFetch<HKOWarningSummaryResponse>('warnsum', lang);
}

export async function getHKOWarningInfo(lang: 'en' | 'tc' = 'en'): Promise<HKOWarningInfoResponse> {
  return hkoFetch<HKOWarningInfoResponse>('warningInfo', lang);
}

export async function getHKOCurrentWeather(lang: 'en' | 'tc' = 'en'): Promise<HKOCurrentWeatherResponse> {
  return hkoFetch<HKOCurrentWeatherResponse>('rhrread', lang);
}

// --- Data building ---

export async function getHKODailyAndWarnings(
  lang: 'en' | 'tc' = 'en',
  lat?: number,
  lon?: number
): Promise<{ daily: DailyForecast[]; warnings: HKOWarning[]; nearestStation?: string; nearestDistrict?: string; timezone?: string }> {
  const [forecastData, warningsData, warningInfoData] = await Promise.all([
    getHKOForecast(lang),
    getHKOWarningSummary(lang),
    getHKOWarningInfo(lang).catch(() => ({ details: [] } as HKOWarningInfoResponse)),
  ]);

  let nearestStation: { name: string; distance: number } | null = null;
  let nearestDistrict: { name: string; distance: number } | null = null;

  if (lat !== undefined && lon !== undefined) {
    nearestStation = findNearestStation(lat, lon, 'en');
    nearestDistrict = findNearestDistrict(lat, lon, 'en');
  }

  const daily: DailyForecast[] = forecastData.weatherForecast.slice(0, 7).map(day => {
    const date = parseHkoDate(day.forecastDate);

    return {
      date,
      temperatureMax: day.forecastMaxtemp.value,
      temperatureMin: day.forecastMintemp.value,
      weatherCode: hkoIconToWeatherCode(day.ForecastIcon),
      precipitationProbabilityMax: psrToPercentage(day.PSR),
      precipitationProbabilityRaw: normalizePsr(day.PSR),
      sunrise: new Date(0),
      sunset: new Date(0),
    };
  });

  const warningInfoDetails = warningInfoData.details || [];
  const warnings: HKOWarning[] = Object.entries(warningsData).map(([key, warning]) => {
    const matchingDetail = warningInfoDetails.find(d =>
      d.warningStatementCode === warning.code ||
      d.subtype === warning.code ||
      warning.code.startsWith(d.warningStatementCode)
    );
    return {
      ...warning,
      details: matchingDetail ? {
        contents: matchingDetail.contents,
        subtype: matchingDetail.subtype,
        updateTime: matchingDetail.updateTime,
      } : undefined,
    };
  });

  return {
    daily,
    warnings,
    nearestStation: nearestStation?.name,
    nearestDistrict: nearestDistrict?.name,
    timezone: 'Asia/Hong_Kong',
  };
}

export async function buildHKOWeatherData(
  currentHko: HKOCurrentWeatherResponse,
  dailyAndWarnings: { daily: DailyForecast[]; warnings: HKOWarning[]; nearestStation?: string; nearestDistrict?: string; timezone?: string },
  lat: number,
  lon: number,
  lang: 'en' | 'tc' = 'en'
): Promise<WeatherData> {
  const nearestStation = findNearestStation(lat, lon, lang);
  const stationName = nearestStation?.name || (lang === 'tc' ? '香港天文台' : 'Hong Kong Observatory');

  let temperature = 25;
  const tempReading = currentHko.temperature.data.find(t => t.place === stationName)
    || currentHko.temperature.data.find(t => t.place === (lang === 'tc' ? '香港天文台' : 'Hong Kong Observatory'))
    || currentHko.temperature.data[0];
  if (tempReading) temperature = tempReading.value;

  let humidity = 75;
  const humReading = currentHko.humidity.data.find(h => h.place === (lang === 'tc' ? '香港天文台' : 'Hong Kong Observatory'))
    || currentHko.humidity.data[0];
  if (humReading) humidity = humReading.value;

  let precipitation = 0;
  const nearestDistrict = findNearestDistrict(lat, lon, lang);
  if (nearestDistrict && currentHko.rainfall?.data) {
    const rainReading = currentHko.rainfall.data.find(r => r.place === nearestDistrict.name);
    if (rainReading) precipitation = rainReading.max;
  }

  let uvIndex = 0;
  if (currentHko.uvindex?.data?.length) uvIndex = currentHko.uvindex.data[0].value;

  let weatherCode = 3;
  if (currentHko.icon?.length) weatherCode = hkoIconToWeatherCode(currentHko.icon[0]);

  const currentHour = new Date().getHours();
  const isDay = currentHour >= 6 && currentHour < 19;

  const eVal = (humidity / 100) * 6.105 * Math.exp((17.27 * temperature) / (237.7 + temperature));
  const apparentTemperature = Math.round(temperature + 0.33 * eVal - 4.0);

  const current: CurrentWeather = {
    temperature, apparentTemperature, humidity, uvIndex, weatherCode,
    windSpeed: 0, windDirection: 0, precipitation,
    precipitationProbability: dailyAndWarnings.daily[0]?.precipitationProbabilityMax || 0,
    precipitationProbabilityRaw: dailyAndWarnings.daily[0]?.precipitationProbabilityRaw,
    isDay,
  };

  const hourly: HourlyForecast[] = [];
  const startHour = new Date();
  startHour.setMinutes(0, 0, 0);
  for (let i = 0; i < 8; i++) {
    const hourTime = new Date(startHour.getTime() + i * 60 * 60 * 1000);
    hourly.push({
      time: hourTime, temperature, weatherCode,
      windSpeed: 0, windDirection: 0,
      precipitationProbability: current.precipitationProbability,
      precipitation: 0,
      isDay: hourTime.getHours() >= 6 && hourTime.getHours() < 19,
    });
  }

  return {
    current, hourly,
    daily: dailyAndWarnings.daily,
    warnings: dailyAndWarnings.warnings,
    timezone: 'Asia/Hong_Kong',
    nearestStation: dailyAndWarnings.nearestStation,
    nearestDistrict: dailyAndWarnings.nearestDistrict,
    isFallback: true,
    fallbackSource: 'HKO',
  };
}

export async function fetchHKOWeatherData(
  lat: number,
  lon: number,
  lang: 'en' | 'tc' = 'en'
): Promise<WeatherData> {
  const [currentHko, dailyAndWarnings] = await Promise.all([
    getHKOCurrentWeather(lang),
    getHKODailyAndWarnings(lang, lat, lon),
  ]);
  return buildHKOWeatherData(currentHko, dailyAndWarnings, lat, lon, lang);
}
