/** Public weather data transport types */

export interface GeoLocation {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string;
}

export interface CurrentWeather {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  uvIndex: number | null;
  weatherCode: number;
  windSpeed: number;
  windDirection: number;
  precipitation: number;
  precipitationProbability: number;
  /** Raw PSR value for HKO (e.g., "Medium Low", "中低") */
  precipitationProbabilityRaw?: string;
  isDay: boolean;
}

export interface HourlyForecast {
  time: Date;
  temperature: number;
  weatherCode: number;
  windSpeed: number;
  windDirection: number;
  precipitationProbability: number;
  precipitation: number;
  /** Raw PSR value for HKO */
  precipitationProbabilityRaw?: string;
  isDay: boolean;
}

export interface DailyForecast {
  date: Date;
  temperatureMax: number;
  temperatureMin: number;
  weatherCode: number;
  windSpeedMax: number;
  windDirectionDominant: number;
  precipitationProbabilityMax: number;
  /** Raw PSR value for HKO */
  precipitationProbabilityRaw?: string;
  sunrise: Date;
  sunset: Date;
}

export interface WeatherData {
  current: CurrentWeather;
  hourly: HourlyForecast[];
  daily: DailyForecast[];
  warnings?: any[];
  timezone?: string;
  nearestStation?: string;
  nearestDistrict?: string;
  isFallback?: boolean;
  fallbackSource?: 'HKO' | 'cache';
  isExpiredCache?: boolean;
  hkoFailed?: boolean;
}