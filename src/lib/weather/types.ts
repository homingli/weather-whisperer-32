/** Public weather data transport types */

import type { HKOWarning } from '../hko-types';
import type { AqhiLevel } from '../hko-aqhi';

export interface GeoLocation {
  /** City/place name */
  name: string;
  /** Latitude in degrees */
  latitude: number;
  /** Longitude in degrees */
  longitude: number;
  /** ISO country code */
  country: string;
  /** Administrative region (state, province) */
  admin1?: string;
}

export interface CurrentWeather {
  /** Temperature in Celsius */
  temperature: number;
  /** Feels-like temperature in Celsius */
  apparentTemperature: number;
  /** Relative humidity percentage (0-100) */
  humidity: number;
  /** UV index (0+) */
  uvIndex: number | null;
  /** WMO weather code */
  weatherCode: number;
  /** Wind speed in km/h */
  windSpeed: number;
  /** Wind direction in degrees (0-360) */
  windDirection: number;
  /** Recent rainfall in mm */
  precipitation: number;
  /** Precipitation probability percentage (0-100) */
  precipitationProbability: number;
  /** Raw PSR value for HKO (e.g., "Medium Low", "中低") */
  precipitationProbabilityRaw?: string;
  /** Whether it is currently daytime */
  isDay: boolean;
  /**
   * Air Quality Health Index (EPD scale, 1–10+). HK locations only — the
   * EPD RSS feed has no Open-Meteo equivalent, so non-HK data leaves these
   * undefined and the UI renders nothing (no "—" placeholder). Undefined
   * also when the EPD fetch failed: AQHI degrades silently.
   */
  aqhiIndex?: number;
  /** Health-risk band derived from `aqhiIndex` */
  aqhiLevel?: AqhiLevel;
  /** EPD monitoring station the reading was taken from (fetch language) */
  aqhiStation?: string;
}

export interface HourlyForecast {
  /** Forecast timestamp */
  time: Date;
  /** Temperature in Celsius */
  temperature: number;
  /** WMO weather code */
  weatherCode: number;
  /** Wind speed in km/h */
  windSpeed: number;
  /** Wind direction in degrees (0-360) */
  windDirection: number;
  /** Precipitation probability percentage (0-100) */
  precipitationProbability: number;
  /** Expected precipitation in mm */
  precipitation: number;
  /** Raw PSR value for HKO */
  precipitationProbabilityRaw?: string;
  /** Whether this hour is daytime */
  isDay: boolean;
}

/**
 * One 15-minute precipitation point (Open-Meteo `minutely_15`). The value
 * is the sum over the window ending at `time` (preceding-15-minutes), so
 * rain consumers should treat the window as (time − 15 min, time].
 *
 * Note on precision: Open-Meteo snaps requests to ~7–8 km model grid cells
 * (verified 2026-09-17 — Kwun Tong and Central return the identical cell),
 * so this series is city-scale, not district-scale. The HKO nowcast grid
 * (~1 km, 0–2 h) is the only district-precise rain source in the app.
 */
export interface MinutelyPrecipitation {
  /** Interval-end timestamp as returned by the API */
  time: Date;
  /** Precipitation in mm over the preceding 15 minutes */
  precipitation: number;
}

export interface DailyForecast {
  /** Forecast date (midnight local time) */
  date: Date;
  /** Maximum temperature in Celsius */
  temperatureMax: number;
  /** Minimum temperature in Celsius */
  temperatureMin: number;
  /** WMO weather code */
  weatherCode: number;
  /** Maximum wind speed in km/h */
  windSpeedMax: number;
  /** Dominant wind direction in degrees (0-360) */
  windDirectionDominant: number;
  /** Maximum precipitation probability (0-100) */
  precipitationProbabilityMax: number;
  /** Raw PSR value for HKO */
  precipitationProbabilityRaw?: string;
  /** Sunrise time */
  sunrise: Date;
  /** Sunset time */
  sunset: Date;
}

export interface WeatherData {
  /**
   * Headline source for the `CurrentWeather` hero. Always present — non-HK
   * paths and degraded cases write `{ source: 'om' }` so downstream code
   * never has to handle `undefined`. When `source === 'hko'`, the headline
   * reads from the HKO icon taxonomy via `getHKODescription(hkoIconCode)`;
   * otherwise it falls through to the WMO path using `current.weatherCode`.
   */
  headline: HeadlineInfo;
  /** Current conditions */
  current: CurrentWeather;
  /** Hourly forecast (may be empty) */
  hourly: HourlyForecast[];
  /**
   * 15-minute precipitation series anchored at the current interval,
   * capped at 24 h. Optional: absent from cached snapshots written before
   * this field existed and when the API degrades. City-scale only — see
   * the caveat on `MinutelyPrecipitation`.
   */
  minutely?: MinutelyPrecipitation[];
  /** Daily forecast */
  daily: DailyForecast[];
  /** Active weather warnings */
  warnings?: HKOWarning[];
  /** IANA timezone identifier */
  timezone?: string;
  /** Nearest weather station name */
  nearestStation?: string;
  /** Nearest district name */
  nearestDistrict?: string;
  /** Whether this data is from any fallback path (live or cached) */
  isFallback?: boolean;
  /**
   * Fallback source. Only meaningful when `isFallback` is true.
   * - 'HKO'     — legacy: OM unavailable, HKO carries the show (HK path)
   * - 'cache'   — both sources unavailable; payload comes from localStorage
   * - 'partial' — one source live, the other missing or expired
   */
  fallbackSource?: 'HKO' | 'cache' | 'partial';
  /** True iff every available source has passed its TTL */
  isExpiredCache?: boolean;
  /** Whether HKO fetch failed (kept for backward compatibility) */
  hkoFailed?: boolean;
  /**
   * Per-source freshness state. Present on every return from `fetchWeather`
   * so the UI can render the right banner tone (none / amber / red).
   */
  sources?: Partial<Record<SourceId, SourceState>>;
}

/** Identifier for a weather data source */
export type SourceId = 'om' | 'hko';

/**
 * Polymorphic headline carrier. `source` discriminates which code set the
 * `CurrentWeather` hero should read; `hkoIconCode` is meaningful only when
 * `source === 'hko'`.
 */
export interface HeadlineInfo {
  source: 'hko' | 'om';
  /** HKO icon code (50–93). Undefined when source is 'om'. */
  hkoIconCode?: number | null;
}

/** Per-source freshness snapshot embedded in `WeatherData.sources` */
export type SourceState = {
  /** Did the most recent fetch attempt for this source succeed? */
  ok: boolean;
  /** Epoch ms of the last successful fetch for this source */
  cachedAt: number;
  /** Source-specific TTL in ms */
  ttlMs: number;
  /** True if `Date.now() - cachedAt > ttlMs`. Always false when `ok` is true. */
  isExpired: boolean;
};
