/**
 * Tolerant parsers for external API responses.
 *
 * Philosophy: external schemas drift. The previous behaviour — `as T` cast
 * with no runtime check — silently produced `undefined`/`NaN` in the UI when
 * the API added, renamed, or removed a field. The user-visible effect was a
 * broken temperature reading or a missing forecast row, no console signal.
 *
 * Each parser here does three things:
 *   1. Verify the top-level shape with `typeof` / `Array.isArray`.
 *   2. For each field, return a typed value or fall back to a safe default.
 *   3. Collect human-readable paths for any field that fell back.
 *
 * The fetch wrapper calls the parser, logs one summary line if `warnings`
 * is non-empty, and throws only when `data === null` (i.e. the input is
 * fundamentally unparseable — not an object, or the critical array that
 * the rest of the response is built around is missing).
 *
 * Result: a partial schema change logs and degrades gracefully. A complete
 * schema break still throws so the existing fallback chain can take over.
 */

import type {
  HKOForecastResponse,
  HKOWarningSummaryResponse,
  HKOWarningInfoDetail,
  HKOCurrentWeatherResponse,
} from './hko-types';
import type { WeatherData, GeoLocation, MinutelyPrecipitation } from './weather/types';
import { logWarn } from './log';

/** Shared parse result: typed data (or null) plus a list of degraded field paths. */
export type ParseResult<T> = { data: T | null; warnings: string[] };

// ── type guards ────────────────────────────────────────────────────────

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Read a string at `path`, returning `fallback` and pushing a path onto
 *  `warnings` if the value is missing or has the wrong type. The "missing
 *  or wrong" symmetry is deliberate: a missing field is just as much a
 *  shape change as a wrong-type field, and the user wants visibility into
 *  both. */
function readString(
  obj: Record<string, unknown>,
  path: string,
  fallback: string,
  warnings: string[],
): string {
  const v = obj[path];
  if (isString(v)) return v;
  warnings.push(`${path} (string)`);
  return fallback;
}

/** Read a number at `path`, returning `fallback` and pushing a path if
 *  the value is missing or has the wrong type. */
function readNumber(
  obj: Record<string, unknown>,
  path: string,
  fallback: number,
  warnings: string[],
): number {
  const v = obj[path];
  if (isNumber(v)) return v;
  warnings.push(`${path} (number)`);
  return fallback;
}

/** Read a nested object at `path`; returns the object or undefined. */
function readObject(
  obj: Record<string, unknown>,
  path: string,
  warnings: string[],
): Record<string, unknown> | undefined {
  const v = obj[path];
  if (isObject(v)) return v;
  warnings.push(`${path} (object)`);
  return undefined;
}

/** Read a `data: T[]` shape; returns the array (possibly empty) or undefined. */
function readDataArray(
  obj: Record<string, unknown>,
  path: string,
  warnings: string[],
): unknown[] | undefined {
  const v = obj[path];
  if (isObject(v) && Array.isArray(v.data)) return v.data;
  warnings.push(`${path}.data (array)`);
  return undefined;
}

// ── HKO forecast (`fnd`) ──────────────────────────────────────────────

export function parseHKOForecast(input: unknown): ParseResult<HKOForecastResponse> {
  const warnings: string[] = [];
  if (!isObject(input)) return { data: null, warnings: ['root (object)'] };

  // weatherForecast is the critical array — without it, there is nothing to
  // render. Anything else can degrade silently.
  const rawDays = input.weatherForecast;
  if (!Array.isArray(rawDays)) {
    return { data: null, warnings: ['weatherForecast (array)'] };
  }

  const days: HKOForecastResponse['weatherForecast'] = [];
  for (let i = 0; i < rawDays.length; i++) {
    const item = rawDays[i];
    if (!isObject(item)) {
      warnings.push(`weatherForecast[${i}] (object)`);
      continue;
    }
    const date = readString(item, 'forecastDate', '', warnings);
    const maxT = readObject(item, 'forecastMaxtemp', warnings);
    const minT = readObject(item, 'forecastMintemp', warnings);
    if (!date || !maxT || !minT) {
      warnings.push(`weatherForecast[${i}] missing date or temp objects — dropped`);
      continue;
    }
    days.push({
      forecastDate: date,
      week: readString(item, 'week', '', warnings),
      forecastWind: readString(item, 'forecastWind', '', warnings),
      forecastWeather: readString(item, 'forecastWeather', '', warnings),
      forecastMaxtemp: {
        value: readNumber(maxT, 'value', 0, warnings),
        unit: readString(maxT, 'unit', 'C', warnings),
      },
      forecastMintemp: {
        value: readNumber(minT, 'value', 0, warnings),
        unit: readString(minT, 'unit', 'C', warnings),
      },
      forecastMaxrh: readObject(item, 'forecastMaxrh', warnings) as { value: number; unit: string } | undefined ?? { value: 0, unit: '%' },
      forecastMinrh: readObject(item, 'forecastMinrh', warnings) as { value: number; unit: string } | undefined ?? { value: 0, unit: '%' },
      ForecastIcon: readNumber(item, 'ForecastIcon', 0, warnings),
      PSR: readString(item, 'PSR', '', warnings),
    });
  }

  return {
    data: {
      generalSituation: readString(input, 'generalSituation', '', warnings),
      weatherForecast: days,
      updateTime: readString(input, 'updateTime', '', warnings),
    },
    warnings,
  };
}

// ── HKO warning summary (`warnsum`) ───────────────────────────────────
//
// warnsum is keyed by warning code (e.g. "WRAIN", "TC8"). Each value is an
// HKOWarning. We don't drop the whole response on a single bad warning —
// we drop the bad warning and keep the rest.

export function parseHKOWarningSummary(input: unknown): ParseResult<HKOWarningSummaryResponse> {
  const warnings: string[] = [];
  if (!isObject(input)) return { data: {}, warnings: ['root (object)'] };

  const out: HKOWarningSummaryResponse = {};
  for (const [code, raw] of Object.entries(input)) {
    if (!isObject(raw)) {
      warnings.push(`warnings.${code} (object)`);
      continue;
    }
    if (!isString(raw.name) || !isString(raw.code) || !isString(raw.actionCode)) {
      warnings.push(`warnings.${code} missing required name/code/actionCode — dropped`);
      continue;
    }
    out[code] = {
      name: raw.name,
      code: raw.code,
      type: isString(raw.type) ? raw.type : undefined,
      actionCode: raw.actionCode,
      issueTime: isString(raw.issueTime) ? raw.issueTime : '',
      updateTime: isString(raw.updateTime) ? raw.updateTime : '',
      expireTime: isString(raw.expireTime) ? raw.expireTime : undefined,
      details: undefined,
    };
  }
  return { data: out, warnings };
}

// ── HKO current weather (`rhrread`) ───────────────────────────────────

export function parseHKOCurrentWeather(input: unknown): ParseResult<HKOCurrentWeatherResponse> {
  const warnings: string[] = [];
  if (!isObject(input)) return { data: null, warnings: ['root (object)'] };

  // temperature.data and humidity.data are critical — the buildHKOWeatherData
  // path uses them as the primary reading. Without either, return null and
  // let the existing fallback chain take over.
  const tempData = readDataArray(input, 'temperature', warnings);
  const humidityData = readDataArray(input, 'humidity', warnings);
  if (!tempData || !humidityData) {
    return { data: null, warnings: [...warnings, 'temperature.data or humidity.data missing — refusing to return partial current weather'] };
  }

  const rainfallObj = readObject(input, 'rainfall', warnings);
  const rainfallData = rainfallObj && Array.isArray(rainfallObj.data) ? rainfallObj.data : undefined;
  const uvindexObj = readObject(input, 'uvindex', warnings);
  const uvindexData = uvindexObj && Array.isArray(uvindexObj.data) ? uvindexObj.data : undefined;
  const windObj = readObject(input, 'wind', warnings);
  const windData = windObj && Array.isArray(windObj.data) ? windObj.data : undefined;
  const iconRaw = input.icon;
  const icon = Array.isArray(iconRaw) ? iconRaw.filter(isNumber) : [];
  const warningMessage = Array.isArray(input.warningMessage)
    ? input.warningMessage.filter(isString)
    : undefined;

  return {
    data: {
      rainfall: {
        data: (rainfallData as HKOCurrentWeatherResponse['rainfall']['data']) ?? [],
        startTime: rainfallObj ? readString(rainfallObj, 'startTime', '', warnings) : '',
        endTime: rainfallObj ? readString(rainfallObj, 'endTime', '', warnings) : '',
      },
      icon,
      iconUpdateTime: readString(input, 'iconUpdateTime', '', warnings),
      uvindex: uvindexData
        ? {
            data: uvindexData as HKOCurrentWeatherResponse['uvindex'] extends { data: infer D } ? D : never,
            recordDesc: uvindexObj ? readString(uvindexObj, 'recordDesc', '', warnings) : '',
          }
        : undefined,
      updateTime: readString(input, 'updateTime', '', warnings),
      temperature: {
        data: tempData as HKOCurrentWeatherResponse['temperature']['data'],
        recordTime: readString(input.temperature as Record<string, unknown>, 'recordTime', '', warnings),
      },
      humidity: {
        data: humidityData as HKOCurrentWeatherResponse['humidity']['data'],
        recordTime: readString(input.humidity as Record<string, unknown>, 'recordTime', '', warnings),
      },
      wind: windData
        ? { data: windData as HKOCurrentWeatherResponse['wind'] extends { data: infer D } ? D : never }
        : undefined,
      warningMessage,
    },
    warnings,
  };
}

// ── HKO warning info (`warningInfo`) ──────────────────────────────────

export function parseHKOWarningInfo(input: unknown): ParseResult<HKOWarningInfoDetail[] | undefined> {
  const warnings: string[] = [];
  if (!isObject(input)) return { data: undefined, warnings: ['root (object)'] };
  const detailsRaw = input.details;
  if (!Array.isArray(detailsRaw)) {
    return { data: undefined, warnings: ['details (array)'] };
  }
  // The full shape is the same as before; we just return it loosely typed
  // because the existing code only reads contents/subtype/updateTime.
  return { data: detailsRaw as HKOWarningInfoDetail[], warnings };
}

// ── Open-Meteo forecast ───────────────────────────────────────────────

export function parseOpenMeteoForecast(input: unknown): ParseResult<WeatherData> {
  const warnings: string[] = [];
  if (!isObject(input)) return { data: null, warnings: ['root (object)'] };

  // Critical: current, hourly, daily must be objects with the expected keys.
  const current = readObject(input, 'current', warnings);
  const hourly = readObject(input, 'hourly', warnings);
  const daily = readObject(input, 'daily', warnings);
  if (!current || !hourly || !daily) {
    return { data: null, warnings: [...warnings, 'current/hourly/daily missing — refusing to return partial forecast'] };
  }

  // current: { temperature_2m, apparent_temperature, ... } — all required
  // numbers except uv_index (nullable) and precipitation (nullable).
  const currentTemp = readNumber(current, 'temperature_2m', 0, warnings);
  const tz = readString(input, 'timezone', '', warnings);

  // hourly: { time: number[], temperature_2m: number[], ... }
  const hourlyTime = readArrayNumber(hourly, 'time', warnings);
  const hourlyTemp = readArrayNumber(hourly, 'temperature_2m', warnings);
  const hourlyCode = readArrayNumber(hourly, 'weather_code', warnings);
  const hourlyPop = readArrayNumber(hourly, 'precipitation_probability', warnings);
  const hourlyPrecip = readArrayNumber(hourly, 'precipitation', warnings);
  const hourlyWind = readArrayNumber(hourly, 'wind_speed_10m', warnings);
  const hourlyWindDir = readArrayNumber(hourly, 'wind_direction_10m', warnings);
  const hourlyIsDay = readArrayNumber(hourly, 'is_day', warnings);

  // minutely_15 (optional): 15-minute precipitation. Missing or degraded →
  // `minutely` stays undefined and the rain-start UI falls back to hourly.
  // Unlike the hourly arrays above (which are filtered per-array), the two
  // arrays here are zipped then filtered so one bad cell can't misalign the
  // series. Verified live 2026-09-17: `time` values are true UTC epochs
  // (current.time sat 583 s behind Date.now()), aligned to :00/:15/:30/:45.
  const minutely = parseMinutelyPrecipitation(input.minutely_15, warnings);

  // daily: { time, weather_code, temperature_2m_max, ..., sunrise, sunset }
  const dailyTime = readArrayNumber(daily, 'time', warnings);
  const dailyMax = readArrayNumber(daily, 'temperature_2m_max', warnings);
  const dailyMin = readArrayNumber(daily, 'temperature_2m_min', warnings);
  const dailyCode = readArrayNumber(daily, 'weather_code', warnings);
  const dailyPop = readArrayNumber(daily, 'precipitation_probability_max', warnings);
  const dailyWindMax = readArrayNumber(daily, 'wind_speed_10m_max', warnings);
  const dailyWindDir = readArrayNumber(daily, 'wind_direction_10m_dominant', warnings);
  const dailySunrise = readArrayNumber(daily, 'sunrise', warnings);
  const dailySunset = readArrayNumber(daily, 'sunset', warnings);

  // Find current hour index (unixtime).
  const nowUnix = Math.floor(Date.now() / 1000);
  const currentHourIndex = hourlyTime.findIndex(t => nowUnix >= t && nowUnix < t + 3600);
  const startIndex = currentHourIndex >= 0 ? currentHourIndex : 0;

  const currentPrecipProb = hourlyPop[startIndex] ?? 0;

  return {
    data: {
      headline: { source: 'om' as const },
      current: {
        temperature: currentTemp,
        apparentTemperature: readNumber(current, 'apparent_temperature', currentTemp, warnings),
        humidity: readNumber(current, 'relative_humidity_2m', 0, warnings),
        uvIndex: readOptionalNumber(current, 'uv_index'),
        weatherCode: readNumber(current, 'weather_code', 0, warnings),
        windSpeed: readNumber(current, 'wind_speed_10m', 0, warnings),
        windDirection: readNumber(current, 'wind_direction_10m', 0, warnings),
        precipitation: readOptionalNumber(current, 'precipitation') ?? 0,
        precipitationProbability: currentPrecipProb,
        isDay: readNumber(current, 'is_day', 1, warnings) === 1,
      },
      hourly: hourlyTime.slice(startIndex, startIndex + 13).map((time, i) => ({
        time: new Date(time * 1000),
        temperature: hourlyTemp[startIndex + i] ?? 0,
        weatherCode: hourlyCode[startIndex + i] ?? 0,
        windSpeed: hourlyWind[startIndex + i] ?? 0,
        windDirection: hourlyWindDir[startIndex + i] ?? 0,
        precipitationProbability: hourlyPop[startIndex + i] ?? 0,
        precipitation: hourlyPrecip[startIndex + i] ?? 0,
        isDay: (hourlyIsDay[startIndex + i] ?? 1) === 1,
      })),
      minutely,
      daily: dailyTime.map((time, i) => ({
        date: new Date(time * 1000),
        temperatureMax: dailyMax[i] ?? 0,
        temperatureMin: dailyMin[i] ?? 0,
        weatherCode: dailyCode[i] ?? 0,
        windSpeedMax: dailyWindMax[i] ?? 0,
        windDirectionDominant: dailyWindDir[i] ?? 0,
        precipitationProbabilityMax: dailyPop[i] ?? 0,
        sunrise: new Date((dailySunrise[i] ?? time) * 1000),
        sunset: new Date((dailySunset[i] ?? time) * 1000),
      })),
      timezone: tz,
    },
    warnings,
  };
}

/**
 * Parse the optional `minutely_15` block: anchor at the interval covering
 * "now" (same convention as the hourly `startIndex` above) and cap at
 * 96 steps (24 h) to bound the localStorage snapshot size. Returns
 * undefined when the block is missing or empty — never throws.
 */
function parseMinutelyPrecipitation(
  input: unknown,
  warnings: string[],
): MinutelyPrecipitation[] | undefined {
  if (!isObject(input)) {
    warnings.push('minutely_15 (object)');
    return undefined;
  }
  const rawTime = input.time;
  const rawPrecip = input.precipitation;
  if (!Array.isArray(rawTime) || !Array.isArray(rawPrecip)) {
    warnings.push('minutely_15.time/precipitation (array)');
    return undefined;
  }

  const points: MinutelyPrecipitation[] = [];
  for (let i = 0; i < Math.min(rawTime.length, rawPrecip.length); i++) {
    const t = rawTime[i];
    const p = rawPrecip[i];
    if (!isNumber(t) || !isNumber(p)) continue;
    points.push({ time: new Date(t * 1000), precipitation: p });
  }
  if (points.length === 0) {
    warnings.push('minutely_15 (empty after zip-filter)');
    return undefined;
  }

  const nowUnix = Math.floor(Date.now() / 1000);
  // `time` stamps the interval END (value = preceding-15-min sum), so the
  // window covering "now" is the first whose stamp is still in the future.
  // A stale all-past snapshot falls back to index 0; downstream consumers
  // drop closed windows anyway.
  let startIndex = points.findIndex((pt) => Math.floor(pt.time.getTime() / 1000) > nowUnix);
  if (startIndex < 0) startIndex = 0;
  return points.slice(startIndex, startIndex + 96);
}

function readArrayNumber(
  obj: Record<string, unknown>,
  path: string,
  warnings: string[],
): number[] {
  const v = obj[path];
  if (Array.isArray(v)) {
    return v.filter(isNumber);
  }
  warnings.push(`${path} (number[])`);
  return [];
}

function readOptionalNumber(obj: Record<string, unknown>, path: string): number | null {
  const v = obj[path];
  if (v === null) return null;
  if (isNumber(v)) return v;
  return null;
}

// ── Nominatim search (Open-Meteo geocoding) ───────────────────────────

/** Parse an Open-Meteo geocoding search response into typed rows.
 *  Open-Meteo omits the localized `country` name for some territories
 *  (notably Hong Kong) and returns only `country_code`; fall back to the
 *  ISO code so those rows are kept instead of dropped. */
export function parseNominatimSearch(input: unknown): ParseResult<GeoLocation[]> {
  const warnings: string[] = [];
  if (!isObject(input)) return { data: [], warnings: ['root (object)'] };
  const raw = input.results;
  if (!Array.isArray(raw)) {
    return { data: [], warnings: ['results (array)'] };
  }
  const out: GeoLocation[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    if (!isObject(r)) {
      warnings.push(`results[${i}] (object)`);
      continue;
    }
    if (!isString(r.name) || !isNumber(r.latitude) || !isNumber(r.longitude)) {
      warnings.push(`results[${i}] missing required fields — dropped`);
      continue;
    }
    const country = isString(r.country) ? r.country : isString(r.country_code) ? r.country_code : '';
    if (!country) {
      warnings.push(`results[${i}] missing country and country_code — dropped`);
      continue;
    }
    out.push({
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      country,
      admin1: isString(r.admin1) ? r.admin1 : undefined,
    });
  }
  return { data: out, warnings };
}

// ── Nominatim reverse ─────────────────────────────────────────────────

export function parseNominatimReverse(
  input: unknown,
  fallback: { latitude: number; longitude: number },
): ParseResult<GeoLocation> {
  const warnings: string[] = [];
  const defaults: GeoLocation = {
    name: 'Current Location',
    latitude: fallback.latitude,
    longitude: fallback.longitude,
    country: '',
  };
  if (!isObject(input)) {
    return { data: defaults, warnings: ['root (object)'] };
  }
  const address = readObject(input, 'address', warnings);
  if (!address) {
    return { data: defaults, warnings };
  }
  const name =
    readOptionalString(address, 'city') ??
    readOptionalString(address, 'town') ??
    readOptionalString(address, 'village') ??
    readOptionalString(address, 'municipality') ??
    'Current Location';
  return {
    data: {
      name,
      latitude: fallback.latitude,
      longitude: fallback.longitude,
      country: readOptionalString(address, 'country') ?? '',
      admin1: readOptionalString(address, 'state') ?? readOptionalString(address, 'county') ?? undefined,
    },
    warnings,
  };
}

function readOptionalString(obj: Record<string, unknown>, path: string): string | undefined {
  const v = obj[path];
  return isString(v) ? v : undefined;
}

// ── Fetch wrapper helper ──────────────────────────────────────────────

/**
 * Log a single summary line for a parser that returned warnings. Caps the
 * list at 5 paths to keep the console line scannable.
 */
export function logParseWarnings(label: string, warnings: string[]): void {
  if (warnings.length === 0) return;
  const head = warnings.slice(0, 5).join(', ');
  const more = warnings.length > 5 ? `, +${warnings.length - 5} more` : '';
  logWarn(`${label} shape drift: ${warnings.length} field(s) used defaults [${head}${more}]`);
}
