/** HKO data fetching and building functions */

import { CurrentWeather, DailyForecast, WeatherData } from './weather';
import { HKOCurrentWeatherResponse, HKOForecastResponse, HKOWarning, HKOWarningInfoResponse, HKOWarningSummaryResponse } from './hko-types';
import { findNearestStation, findNearestDistrict } from './hko-stations';
import { normalizePsr, psrToPercentage } from './hko-psr';
import { hkoIconToWeatherCode } from './hko-icons';
import { fetchWithTimeout } from './fetch-utils';
import { logTiming, logFailure } from './log';
import { TIMING } from './constants';
import {
  parseHKOForecast,
  parseHKOWarningSummary,
  parseHKOWarningInfo,
  parseHKOCurrentWeather,
  logParseWarnings,
} from './parsers';

const HKO_API_BASE = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php';

/** Generic HKO API fetcher with consistent timeout, logging, and error handling.
 *  The returned data is `unknown`; callers pass it through the appropriate
 *  parser (parseHKOForecast, etc.) to get a typed shape with logged shape drift. */
async function hkoFetchRaw(dataType: string, lang: 'en' | 'tc'): Promise<unknown> {
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

/** Pick a station reading matching `name` from a HKO `{data: [...]}` payload.
 *  Returns undefined if either the list or the name is missing, so callers
 *  can fall back without a try/catch. Tolerant of HKO partial-feed outages
 *  where `data` may be undefined. */
function pickStationReading<T extends { place: string }>(
  list: { data: T[] } | undefined,
  name: string | undefined,
): T | undefined {
  if (!list?.data || !name) return undefined;
  return list.data.find(r => r.place === name);
}

/** Current HK hour (0-23) using Intl.DateTimeFormat so the result is correct
 *  for users whose browser timezone is not Asia/Hong_Kong. */
function getHKHour(): number {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Hong_Kong',
    hour: 'numeric',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  return isNaN(h) ? new Date().getHours() : h;
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

  // Create date directly in HK timezone by using explicit offset
  const date = new Date(`${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T00:00:00+08:00`);

  if (isNaN(date.getTime())) {
    throw new Error(`Failed to create valid date from HKO date: ${dateStr}`);
  }

  return date;
}

// --- Public fetch functions (delegating to hkoFetch) ---

export async function getHKOForecast(lang: 'en' | 'tc' = 'en'): Promise<HKOForecastResponse> {
  const raw = await hkoFetchRaw('fnd', lang);
  const { data, warnings } = parseHKOForecast(raw);
  logParseWarnings('HKO fnd', warnings);
  if (!data) throw new Error('HKO fnd: unparseable response');
  return data;
}

export async function getHKOWarningSummary(lang: 'en' | 'tc' = 'en'): Promise<HKOWarningSummaryResponse> {
  const raw = await hkoFetchRaw('warnsum', lang);
  const { data, warnings } = parseHKOWarningSummary(raw);
  logParseWarnings('HKO warnsum', warnings);
  return data ?? {};
}

export async function getHKOWarningInfo(lang: 'en' | 'tc' = 'en'): Promise<HKOWarningInfoResponse> {
  const raw = await hkoFetchRaw('warningInfo', lang);
  const { data, warnings } = parseHKOWarningInfo(raw);
  logParseWarnings('HKO warningInfo', warnings);
  return { details: data ?? undefined };
}

export async function getHKOCurrentWeather(lang: 'en' | 'tc' = 'en'): Promise<HKOCurrentWeatherResponse> {
  const raw = await hkoFetchRaw('rhrread', lang);
  const { data, warnings } = parseHKOCurrentWeather(raw);
  logParseWarnings('HKO rhrread', warnings);
  if (!data) throw new Error('HKO rhrread: unparseable response');
  return data;
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
    nearestStation = findNearestStation(lat, lon, lang);
    nearestDistrict = findNearestDistrict(lat, lon, lang);
  }

  const daily: DailyForecast[] = forecastData.weatherForecast.slice(0, 7).map(day => {
    const date = parseHkoDate(day.forecastDate);

    return {
      date,
      temperatureMax: day.forecastMaxtemp.value,
      temperatureMin: day.forecastMintemp.value,
      weatherCode: hkoIconToWeatherCode(day.ForecastIcon),
      // HKO daily forecast does not publish wind; placeholders are merged
      // with OM's daily in the manager to populate these fields.
      windSpeedMax: 0,
      windDirectionDominant: 0,
      precipitationProbabilityMax: psrToPercentage(day.PSR),
      precipitationProbabilityRaw: normalizePsr(day.PSR),
      sunrise: new Date(0),
      sunset: new Date(0),
    };
  });

  const warningInfoDetails = warningInfoData.details || [];
  const warnings: HKOWarning[] = Object.entries(warningsData).map(([_key, warning]) => {
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
  const hkoObsName = lang === 'tc' ? '香港天文台' : 'Hong Kong Observatory';
  const tempReading = pickStationReading(currentHko.temperature, stationName)
    || pickStationReading(currentHko.temperature, hkoObsName)
    || currentHko.temperature.data?.[0];
  if (tempReading) temperature = tempReading.value;

  let humidity = 75;
  const humReading = pickStationReading(currentHko.humidity, hkoObsName)
    || currentHko.humidity.data?.[0];
  if (humReading) humidity = humReading.value;

  let precipitation = 0;
  const nearestDistrict = findNearestDistrict(lat, lon, lang);
  if (nearestDistrict) {
    const rainReading = pickStationReading(currentHko.rainfall, nearestDistrict.name);
    if (rainReading) precipitation = rainReading.max;
  }

  let uvIndex = 0;
  if (currentHko.uvindex?.data?.length) uvIndex = currentHko.uvindex.data[0].value;

  let weatherCode = 3;
  if (currentHko.icon?.length) weatherCode = hkoIconToWeatherCode(currentHko.icon[0]);

  let windSpeed = 0;
  let windDirection = 0;
  const windReading = pickStationReading(currentHko.wind, stationName)
    || pickStationReading(currentHko.wind, hkoObsName)
    || currentHko.wind?.data?.[0];
  if (windReading) {
    windSpeed = windReading.speed;
    windDirection = windReading.direction;
  }

  const isDay = getHKHour() >= 6 && getHKHour() < 19;

  const eVal = (humidity / 100) * 6.105 * Math.exp((17.27 * temperature) / (237.7 + temperature));
  const apparentTemperature = Math.round(temperature + 0.33 * eVal - 4.0);

  const current: CurrentWeather = {
    temperature, apparentTemperature, humidity, uvIndex, weatherCode,
    windSpeed, windDirection, precipitation,
    precipitationProbability: dailyAndWarnings.daily[0]?.precipitationProbabilityMax || 0,
    precipitationProbabilityRaw: dailyAndWarnings.daily[0]?.precipitationProbabilityRaw,
    isDay,
  };

  // HKO does not publish hourly data; return empty array
  return {
    current, hourly: [],
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
