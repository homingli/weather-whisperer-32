// Weather API service using Open-Meteo

// Helper to parse daily date string "YYYY-MM-DD" as midnight in specified timezone
export function parseDailyDateInTimezone(dateStr: string, timezone: string): Date {
  // The API returns daily time as "YYYY-MM-DD" 
  // We need to interpret this as midnight in the city's timezone, not UTC
  try {
    const [year, month, day] = dateStr.split('-').map(Number);

    // Create a date at 12:00 UTC to avoid DST edge cases
    // This ensures we're definitely on the correct calendar day in the target timezone
    const utcRef = Date.UTC(year, month - 1, day, 12, 0, 0, 0);

    // Find the offset of the target timezone at noon on this date
    const testDate = new Date(utcRef);
    const utcString = testDate.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzString = testDate.toLocaleString('en-US', { timeZone: timezone });

    const utcTime = new Date(utcString).getTime();
    const tzTime = new Date(tzString).getTime();
    const offset = tzTime - utcTime;

    // Return date at local midnight (12:00 UTC - offset - 12 hours = 00:00 local)
    // The UTC time that corresponds to midnight in the target timezone
    return new Date(utcRef - offset - 12 * 60 * 60 * 1000);
  } catch {
    // Fallback: just parse as-is (this will be midnight UTC)
    return new Date(dateStr);
  }
}

// Helper to parse a datetime string in a specific timezone and return correct UTC Date
export function parseDateInTimezone(dateStr: string, timezone: string): Date {
  // The API returns times like "2024-01-08T07:03" without timezone
  // We need to interpret this as being in the city's timezone
  try {
    // Create a formatter that will give us the offset for this timezone at this datetime
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    // Parse the date string as if it were local time
    const localDate = new Date(dateStr);

    // Get what time it would be in the target timezone if this were UTC
    const targetParts = formatter.formatToParts(localDate);
    const getPart = (type: string) => targetParts.find(p => p.type === type)?.value || '0';

    // Calculate the offset by comparing
    // The dateStr represents the actual time in the city
    // We need to find what UTC time corresponds to that city time

    // Use a different approach: create a date from the string parts
    const [datePart, timePart] = dateStr.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);

    // Create a reference date in UTC
    const utcRef = Date.UTC(year, month - 1, day, hour, minute);

    // Find the offset of the target timezone at this approximate time
    const testDate = new Date(utcRef);
    const utcString = testDate.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzString = testDate.toLocaleString('en-US', { timeZone: timezone });

    const utcTime = new Date(utcString).getTime();
    const tzTime = new Date(tzString).getTime();
    const offset = tzTime - utcTime;

    // The actual UTC time is the local time minus the offset
    return new Date(utcRef - offset);
  } catch {
    // Fallback: just parse as-is
    return new Date(dateStr);
  }
}

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
  uvIndex: number;
  weatherCode: number;
  windSpeed: number;
  windDirection: number;
  precipitation: number;
  precipitationProbability: number;
  precipitationProbabilityRaw?: string; // Raw PSR value for HKO (e.g., "Medium Low", "中低")
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
  precipitationProbabilityRaw?: string; // Raw PSR value for HKO
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
  precipitationProbabilityRaw?: string; // Raw PSR value for HKO
  sunrise: Date;
  sunset: Date;
}

export interface WeatherData {
  current: CurrentWeather;
  hourly: HourlyForecast[];
  daily: DailyForecast[];
  timezone?: string;
}

// Geocoding API to search for cities
export async function searchCities(query: string): Promise<GeoLocation[]> {
  if (query.length < 2) return [];
  if (query.length > 100) return [];

  // Validate input contains only allowed characters
  if (!/^[a-zA-Z0-9\s\-',.]+$/.test(query)) return [];

  try {
    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`
    );

    if (!response.ok) throw new Error('Failed to search cities');

    const data = await response.json();
    return (data.results || []).map((r: { name: string; latitude: number; longitude: number; country: string; admin1?: string }) => ({
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      country: r.country,
      admin1: r.admin1,
    }));
  } catch (err) {
    console.error('Error searching cities:', err);
    return [];
  }
}

// Weather API to get current and forecast data
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

  let data;
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!response.ok) throw new Error('Failed to fetch weather');
    data = await response.json();
  } catch (err) {
    console.error('Weather fetch error:', err);
    throw err;
  }

  // With unixtime, data.current.time and data.hourly.time are numbers (Unix seconds)
  // Finding the current hour index is now a simple numeric comparison
  const currentTime = data.current.time;
  
  // Find the index for the current hour in the city's timezone
  // We look for the hour that matches or is just before the current time
  const currentHourIndex = data.hourly.time.findIndex((t: number) => {
    // Each hourly point represents the start of the hour
    // So we want the one where currentTime is between t and t + 3600
    return currentTime >= t && currentTime < t + 3600;
  });

  // Fallback to index 0 if we can't find the exact hour
  const startIndex = currentHourIndex >= 0 ? currentHourIndex : 0;

  // Get precipitation probability for current hour
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
      precipitation: data.current.precipitation,
      precipitationProbability: currentPrecipProb,
      isDay: data.current.is_day === 1,
    },
    hourly: data.hourly.time.slice(startIndex, startIndex + 13).map((time: number, i: number) => ({
      // Unix timestamp to Date object (multiply by 1000 for ms)
      time: new Date(time * 1000),
      temperature: data.hourly.temperature_2m[startIndex + i],
      weatherCode: data.hourly.weather_code[startIndex + i],
      windSpeed: data.hourly.wind_speed_10m[startIndex + i],
      windDirection: data.hourly.wind_direction_10m[startIndex + i],
      precipitationProbability: data.hourly.precipitation_probability[startIndex + i],
      precipitation: data.hourly.precipitation[startIndex + i],
      isDay: data.hourly.is_day[startIndex + i] === 1,
    })),
    daily: data.daily.time.map((time: number, i: number) => ({
      // Unix timestamp to Date object
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

// Weather code descriptions and icons
export function getWeatherDescription(code: number): string {
  const descriptions: Record<number, string> = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    56: 'Freezing drizzle',
    57: 'Dense freezing drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    66: 'Freezing rain',
    67: 'Heavy freezing rain',
    71: 'Slight snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
    77: 'Snow grains',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with hail',
    99: 'Thunderstorm with heavy hail',
  };
  return descriptions[code] || 'Unknown';
}

export function getWeatherIcon(code: number, isDay: boolean): string {
  // Returns emoji icons based on weather code
  if (code === 0) return isDay ? '☀️' : '🌙';
  if (code <= 2) return isDay ? '🌤️' : '☁️';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 57) return '🌧️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  if (code <= 86) return '🌨️';
  if (code >= 95) return '⛈️';
  return '🌡️';
}

// Local storage helpers for default city
const STORAGE_KEY = 'weather-default-city';
const RECENT_CITIES_KEY = 'weather-recent-cities';
const MAX_RECENT_CITIES = 3;

export function getDefaultCity(): GeoLocation | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as GeoLocation;
  } catch {
    return null;
  }
}

export function setDefaultCity(city: GeoLocation): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(city));
  addRecentCity(city);
}

export function getRecentCities(): GeoLocation[] {
  const stored = localStorage.getItem(RECENT_CITIES_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored) as GeoLocation[];
  } catch {
    return [];
  }
}

function addRecentCity(city: GeoLocation): void {
  const recent = getRecentCities();
  const filtered = recent.filter(
    (c) => !(c.latitude === city.latitude && c.longitude === city.longitude)
  );
  filtered.unshift(city);
  localStorage.setItem(RECENT_CITIES_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT_CITIES)));
}

// Get user's current location using browser geolocation
export function getUserLocation(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        reject(error);
      },
      { timeout: 5000, enableHighAccuracy: false }
    );
  });
}

// Reverse geocode coordinates to get city name
export async function reverseGeocode(latitude: number, longitude: number): Promise<GeoLocation | null> {
  // Validate coordinate ranges
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  try {
    // Use Open-Meteo's geocoding with a search nearby the coordinates
    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=city&count=1&language=en&format=json`
    );

    // Open-Meteo doesn't have reverse geocoding, so we'll use a different approach
    // We'll use the coordinates directly and try to find the nearest city via search
    // For now, create a location object with the coordinates
    const cityResponse = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(latitude.toString())}&lon=${encodeURIComponent(longitude.toString())}&format=json`,
      { headers: { 'User-Agent': 'weather-whisperer/1.0' } }
    );

    if (!cityResponse.ok) {
      // Fallback: just use coordinates
      return {
        name: 'Current Location',
        latitude,
        longitude,
        country: '',
      };
    }

    const data = await cityResponse.json();
    const address = data.address || {};

    return {
      name: address.city || address.town || address.village || address.municipality || 'Current Location',
      latitude,
      longitude,
      country: address.country || '',
      admin1: address.state || address.county,
    };
  } catch {
    return {
      name: 'Current Location',
      latitude,
      longitude,
      country: '',
    };
  }
}
