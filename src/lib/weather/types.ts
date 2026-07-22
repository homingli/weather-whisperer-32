/** Public weather data transport types */

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
  /** Current conditions */
  current: CurrentWeather;
  /** Hourly forecast (may be empty) */
  hourly: HourlyForecast[];
  /** Daily forecast */
  daily: DailyForecast[];
  /** Active weather warnings */
  warnings?: unknown[];
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
