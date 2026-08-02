/**
 * Weather module. Barrel re-export — all logic lives in split modules.
 */

// Types
export type { GeoLocation, CurrentWeather, HourlyForecast, DailyForecast, WeatherData, SourceState, SourceId, HeadlineInfo } from './weather/types';

// Open-Meteo forecast API
export { getWeather } from './weather/open-meteo';

// Geocoding & browser geolocation
export { searchCities, reverseGeocode, getUserLocation } from './weather/geocoding';

// localStorage helpers
export { getDefaultCity, setDefaultCity, getRecentCities } from './weather/storage';

// WMO code description + emoji
export { getWeatherDescription, getWeatherIcon, getWeatherIconNode, weatherDescriptionKey } from './weather/codes';

// HKO icon code description + lucide icon (used by CurrentWeather when
// weather-manager reports `headline.source === 'hko'`).
export { hkoDescriptionKey, getHKODescription, getHKOIconNode, isHKODayTime, HKO_ICON_CODES } from './weather/hko-codes';