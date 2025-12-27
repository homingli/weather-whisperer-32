// Hong Kong Observatory Weather API
// API Documentation: https://www.hko.gov.hk/en/weatherAPI/doc/files/HKO_Open_Data_API_Documentation.pdf

import { CurrentWeather, HourlyForecast, DailyForecast, WeatherData } from './weather';

const HKO_API_BASE = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php';

// HKO API response interfaces
export interface HKOCurrentWeatherResponse {
  rainfall: {
    data: Array<{
      unit: string;
      place: string;
      max: number;
      main: string;
    }>;
    startTime: string;
    endTime: string;
  };
  icon: number[];
  iconUpdateTime: string;
  uvindex?: {
    data: Array<{
      place: string;
      value: number;
      desc: string;
    }>;
    recordDesc: string;
  };
  updateTime: string;
  temperature: {
    data: Array<{
      place: string;
      value: number;
      unit: string;
    }>;
    recordTime: string;
  };
  humidity: {
    data: Array<{
      place: string;
      value: number;
      unit: string;
    }>;
    recordTime: string;
  };
  warningMessage?: string[];
}

export interface HKOForecastResponse {
  generalSituation: string;
  weatherForecast: Array<{
    forecastDate: string;
    week: string;
    forecastWind: string;
    forecastWeather: string;
    forecastMaxtemp: { value: number; unit: string };
    forecastMintemp: { value: number; unit: string };
    forecastMaxrh: { value: number; unit: string };
    forecastMinrh: { value: number; unit: string };
    ForecastIcon: number;
    PSR: string; // Probability of Significant Rain
  }>;
  updateTime: string;
}

export interface HKOWarning {
  name: string;
  code: string;
  type?: string;
  actionCode: string;
  issueTime: string;
  updateTime: string;
  expireTime?: string;
}

export interface HKOWarningSummaryResponse {
  [key: string]: HKOWarning;
}

// Map PSR (Probability of Significant Rain) to percentage
function psrToPercentage(psr: string): number {
  const psrMap: Record<string, number> = {
    'Low': 10,
    'Medium Low': 25,
    'Medium': 50,
    'Medium High': 70,
    'High': 85,
  };
  return psrMap[psr] || 0;
}

// Map HKO icon codes to WMO-like weather codes for consistency
function hkoIconToWeatherCode(iconCode: number): number {
  // HKO icon reference: https://www.hko.gov.hk/textonly/v2/explain/wxicon_e.htm
  const iconMap: Record<number, number> = {
    50: 0,   // Sunny
    51: 1,   // Sunny Periods
    52: 2,   // Sunny Intervals
    53: 2,   // Sunny Periods with A Few Showers
    54: 61,  // Sunny Intervals with Showers
    60: 3,   // Cloudy
    61: 3,   // Overcast
    62: 61,  // Light Rain
    63: 63,  // Rain
    64: 65,  // Heavy Rain
    65: 95,  // Thunderstorms
    70: 0,   // Fine (night)
    71: 1,   // Fine (night)
    72: 2,   // Fine (night)
    73: 2,   // Fine (night) with showers
    74: 61,  // Showers (night)
    75: 3,   // Cloudy (night)
    76: 3,   // Overcast (night)
    77: 61,  // Light Rain (night)
    80: 71,  // Windy
    81: 65,  // Dry
    82: 73,  // Humid
    83: 45,  // Fog
    84: 45,  // Mist
    85: 45,  // Haze
    90: 95,  // Hot
    91: 95,  // Warm
    92: 0,   // Cool
    93: 0,   // Cold
  };
  return iconMap[iconCode] ?? 3;
}

// Determine if it's day or night based on current hour (simplified)
function isCurrentlyDay(): boolean {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 19;
}

// Fetch current weather from HKO
export async function getHKOCurrentWeather(): Promise<HKOCurrentWeatherResponse> {
  const response = await fetch(`${HKO_API_BASE}?dataType=rhrread&lang=en`);
  if (!response.ok) throw new Error('Failed to fetch HKO current weather');
  return response.json();
}

// Fetch 9-day forecast from HKO
export async function getHKOForecast(): Promise<HKOForecastResponse> {
  const response = await fetch(`${HKO_API_BASE}?dataType=fnd&lang=en`);
  if (!response.ok) throw new Error('Failed to fetch HKO forecast');
  return response.json();
}

// Fetch weather warning summary from HKO
export async function getHKOWarningSummary(): Promise<HKOWarningSummaryResponse> {
  const response = await fetch(`${HKO_API_BASE}?dataType=warnsum&lang=en`);
  if (!response.ok) throw new Error('Failed to fetch HKO warnings');
  return response.json();
}

// Get weather for Hong Kong using HKO API
// Note: HKO only provides data for Hong Kong, so lat/lon are ignored
export async function getHKOWeather(): Promise<WeatherData & { warnings: HKOWarning[] }> {
  const [currentData, forecastData, warningsData] = await Promise.all([
    getHKOCurrentWeather(),
    getHKOForecast(),
    getHKOWarningSummary(),
  ]);

  // Get Hong Kong Observatory readings (primary reference station)
  const hkoTemp = currentData.temperature.data.find(d => d.place === 'Hong Kong Observatory');
  const hkoHumidity = currentData.humidity.data.find(d => d.place === 'Hong Kong Observatory');
  
  // Calculate average temperature across all stations as fallback
  const avgTemp = currentData.temperature.data.reduce((sum, d) => sum + d.value, 0) / currentData.temperature.data.length;
  
  // Get current weather icon
  const currentIcon = currentData.icon?.[0] || 50;
  const isDay = isCurrentlyDay();
  
  // Calculate if it's currently raining from rainfall data
  const maxRainfall = Math.max(...currentData.rainfall.data.map(d => d.max));
  
  // Build current weather
  const current: CurrentWeather = {
    temperature: hkoTemp?.value ?? avgTemp,
    apparentTemperature: hkoTemp?.value ?? avgTemp, // HKO doesn't provide apparent temp
    humidity: hkoHumidity?.value ?? 70,
    weatherCode: hkoIconToWeatherCode(currentIcon),
    windSpeed: 0, // Not provided in current weather API
    precipitation: maxRainfall,
    precipitationProbability: psrToPercentage(forecastData.weatherForecast[0]?.PSR || 'Low'),
    isDay,
  };

  // Build hourly forecast (HKO doesn't provide hourly, so we generate approximations)
  // We'll create 13 hours of forecast based on current conditions
  const hourly: HourlyForecast[] = [];
  const now = new Date();
  const todayForecast = forecastData.weatherForecast[0];
  const tomorrowForecast = forecastData.weatherForecast[1];
  
  for (let i = 0; i < 13; i++) {
    const forecastTime = new Date(now.getTime() + i * 60 * 60 * 1000);
    const hour = forecastTime.getHours();
    const isNextDay = forecastTime.getDate() !== now.getDate();
    const forecast = isNextDay ? tomorrowForecast : todayForecast;
    
    // Interpolate temperature based on time of day
    const minTemp = forecast?.forecastMintemp?.value ?? current.temperature - 3;
    const maxTemp = forecast?.forecastMaxtemp?.value ?? current.temperature + 3;
    
    // Simple temperature curve: coldest at 6am, warmest at 2pm
    const tempProgress = Math.sin(((hour - 6) / 8) * Math.PI);
    const temp = minTemp + (maxTemp - minTemp) * Math.max(0, tempProgress);
    
    hourly.push({
      time: forecastTime,
      temperature: Math.round(temp),
      weatherCode: hkoIconToWeatherCode(forecast?.ForecastIcon ?? currentIcon),
      precipitationProbability: psrToPercentage(forecast?.PSR || 'Low'),
      isDay: hour >= 6 && hour < 19,
    });
  }

  // Build daily forecast (up to 7 days)
  const daily: DailyForecast[] = forecastData.weatherForecast.slice(0, 7).map(day => {
    const date = new Date(
      parseInt(day.forecastDate.substring(0, 4)),
      parseInt(day.forecastDate.substring(4, 6)) - 1,
      parseInt(day.forecastDate.substring(6, 8))
    );
    
    // Approximate sunrise/sunset for Hong Kong
    const sunrise = new Date(date);
    sunrise.setHours(6, 45, 0);
    const sunset = new Date(date);
    sunset.setHours(17, 45, 0);
    
    return {
      date,
      temperatureMax: day.forecastMaxtemp.value,
      temperatureMin: day.forecastMintemp.value,
      weatherCode: hkoIconToWeatherCode(day.ForecastIcon),
      precipitationProbabilityMax: psrToPercentage(day.PSR),
      sunrise,
      sunset,
    };
  });

  // Extract warnings
  const warnings: HKOWarning[] = Object.values(warningsData);

  return {
    current,
    hourly,
    daily,
    warnings,
  };
}

// Get warning color based on type
export function getWarningColor(code: string): string {
  if (code.includes('RED') || code.includes('R') || code === 'WFIRER') return 'destructive';
  if (code.includes('BLACK') || code.includes('B') || code === 'WRAINB') return 'destructive';
  if (code.includes('AMBER') || code.includes('A') || code === 'WRAINA') return 'warning';
  if (code.includes('YELLOW') || code.includes('Y') || code === 'WFIREY') return 'warning';
  return 'secondary';
}

// Get warning icon
export function getWarningIcon(warningCode: string): string {
  const iconMap: Record<string, string> = {
    'WFIRE': '🔥',
    'WFROST': '❄️',
    'WHOT': '🌡️',
    'WCOLD': '🥶',
    'WMSGNL': '💨',
    'WRAIN': '🌧️',
    'WFNTSA': '🌊',
    'WL': '⛰️',
    'WTCSGNL': '🌀',
    'WTMW': '🌊',
    'WTS': '⛈️',
  };
  
  // Extract the base warning type
  for (const [key, icon] of Object.entries(iconMap)) {
    if (warningCode.startsWith(key)) return icon;
  }
  return '⚠️';
}
