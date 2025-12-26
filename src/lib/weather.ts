// Weather API service using Open-Meteo

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
  weatherCode: number;
  windSpeed: number;
  precipitation: number;
  precipitationProbability: number;
  isDay: boolean;
}

export interface HourlyForecast {
  time: Date;
  temperature: number;
  weatherCode: number;
  precipitationProbability: number;
  isDay: boolean;
}

export interface DailyForecast {
  date: Date;
  temperatureMax: number;
  temperatureMin: number;
  weatherCode: number;
  precipitationProbabilityMax: number;
  sunrise: Date;
  sunset: Date;
}

export interface WeatherData {
  current: CurrentWeather;
  hourly: HourlyForecast[];
  daily: DailyForecast[];
}

// Geocoding API to search for cities
export async function searchCities(query: string): Promise<GeoLocation[]> {
  if (query.length < 2) return [];
  if (query.length > 100) return [];
  
  // Validate input contains only allowed characters
  if (!/^[a-zA-Z0-9\s\-',\.]+$/.test(query)) return [];
  
  const response = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`
  );
  
  if (!response.ok) throw new Error('Failed to search cities');
  
  const data = await response.json();
  return (data.results || []).map((r: any) => ({
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    country: r.country,
    admin1: r.admin1,
  }));
}

// Weather API to get current and forecast data
export async function getWeather(latitude: number, longitude: number): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day',
    hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    timezone: 'auto',
    forecast_days: '7',
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  
  if (!response.ok) throw new Error('Failed to fetch weather');
  
  const data = await response.json();
  
  // Get current hour index for hourly data
  const currentHour = new Date().getHours();
  const todayStr = new Date().toISOString().split('T')[0];
  const currentHourIndex = data.hourly.time.findIndex((t: string) => 
    t.startsWith(todayStr) && new Date(t).getHours() === currentHour
  );

  // Get precipitation probability for current hour
  const currentPrecipProb = currentHourIndex >= 0 
    ? data.hourly.precipitation_probability[currentHourIndex] 
    : 0;

  return {
    current: {
      temperature: data.current.temperature_2m,
      apparentTemperature: data.current.apparent_temperature,
      humidity: data.current.relative_humidity_2m,
      weatherCode: data.current.weather_code,
      windSpeed: data.current.wind_speed_10m,
      precipitation: data.current.precipitation,
      precipitationProbability: currentPrecipProb,
      isDay: data.current.is_day === 1,
    },
    hourly: data.hourly.time.slice(currentHourIndex, currentHourIndex + 13).map((time: string, i: number) => ({
      time: new Date(time),
      temperature: data.hourly.temperature_2m[currentHourIndex + i],
      weatherCode: data.hourly.weather_code[currentHourIndex + i],
      precipitationProbability: data.hourly.precipitation_probability[currentHourIndex + i],
      isDay: data.hourly.is_day[currentHourIndex + i] === 1,
    })),
    daily: data.daily.time.map((time: string, i: number) => ({
      date: new Date(time),
      temperatureMax: data.daily.temperature_2m_max[i],
      temperatureMin: data.daily.temperature_2m_min[i],
      weatherCode: data.daily.weather_code[i],
      precipitationProbabilityMax: data.daily.precipitation_probability_max[i],
      sunrise: new Date(data.daily.sunrise[i]),
      sunset: new Date(data.daily.sunset[i]),
    })),
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

export function getDefaultCity(): GeoLocation | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function setDefaultCity(city: GeoLocation): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(city));
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
      { timeout: 10000, enableHighAccuracy: false }
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
      `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(latitude.toString())}&lon=${encodeURIComponent(longitude.toString())}&format=json`
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
