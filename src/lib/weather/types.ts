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
  /** Whether this data is from HKO fallback */
  isFallback?: boolean;
  /** Fallback source ('HKO' | 'cache') */
  fallbackSource?: 'HKO' | 'cache';
  /** Whether cached data has expired */
  isExpiredCache?: boolean;
  /** Whether HKO fetch failed */
  hkoFailed?: boolean;
}
