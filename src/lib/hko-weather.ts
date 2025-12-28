// Hong Kong Observatory Weather API
// API Documentation: https://www.hko.gov.hk/en/weatherAPI/doc/files/HKO_Open_Data_API_Documentation.pdf

import { CurrentWeather, HourlyForecast, DailyForecast, WeatherData } from './weather';

const HKO_API_BASE = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php';

// HKO weather station coordinates mapping (English names)
// These are the stations used in the rhrread API for temperature readings
export const HKO_STATIONS_EN: Record<string, { lat: number; lon: number }> = {
  "King's Park": { lat: 22.3119, lon: 114.1728 },
  "Hong Kong Observatory": { lat: 22.3019, lon: 114.1742 },
  "Wong Chuk Hang": { lat: 22.2478, lon: 114.1736 },
  "Ta Kwu Ling": { lat: 22.5288, lon: 114.1567 },
  "Lau Fau Shan": { lat: 22.4686, lon: 113.9844 },
  "Tai Po": { lat: 22.4444, lon: 114.1644 },
  "Sha Tin": { lat: 22.4025, lon: 114.2100 },
  "Tuen Mun": { lat: 22.3858, lon: 113.9639 },
  "Tseung Kwan O": { lat: 22.3158, lon: 114.2556 },
  "Sai Kung": { lat: 22.3769, lon: 114.2744 },
  "Cheung Chau": { lat: 22.2011, lon: 114.0267 },
  "Chek Lap Kok": { lat: 22.3089, lon: 113.9219 },
  "Tsing Yi": { lat: 22.3442, lon: 114.1100 },
  "Shek Kong": { lat: 22.4361, lon: 114.0847 },
  "Tsuen Wan Ho Koon": { lat: 22.3839, lon: 114.1078 },
  "Tsuen Wan Shing Mun Valley": { lat: 22.3756, lon: 114.1247 },
  "Hong Kong Park": { lat: 22.2778, lon: 114.1617 },
  "Shau Kei Wan": { lat: 22.2794, lon: 114.2286 },
  "Kowloon City": { lat: 22.3283, lon: 114.1917 },
  "Happy Valley": { lat: 22.2708, lon: 114.1831 },
  "Wong Tai Sin": { lat: 22.3422, lon: 114.1931 },
  "Stanley": { lat: 22.2186, lon: 114.2119 },
  "Kwun Tong": { lat: 22.3119, lon: 114.2236 },
  "Sham Shui Po": { lat: 22.3303, lon: 114.1594 },
  "Kai Tak Runway Park": { lat: 22.3050, lon: 114.2133 },
  "Yuen Long Park": { lat: 22.4444, lon: 114.0222 },
  "Tai Mei Tuk": { lat: 22.4750, lon: 114.2369 },
};

// HKO weather station coordinates mapping (Traditional Chinese names)
export const HKO_STATIONS_TC: Record<string, { lat: number; lon: number }> = {
  "京士柏": { lat: 22.3119, lon: 114.1728 },
  "香港天文台": { lat: 22.3019, lon: 114.1742 },
  "黃竹坑": { lat: 22.2478, lon: 114.1736 },
  "打鼓嶺": { lat: 22.5288, lon: 114.1567 },
  "流浮山": { lat: 22.4686, lon: 113.9844 },
  "大埔": { lat: 22.4444, lon: 114.1644 },
  "沙田": { lat: 22.4025, lon: 114.2100 },
  "屯門": { lat: 22.3858, lon: 113.9639 },
  "將軍澳": { lat: 22.3158, lon: 114.2556 },
  "西貢": { lat: 22.3769, lon: 114.2744 },
  "長洲": { lat: 22.2011, lon: 114.0267 },
  "赤鱲角": { lat: 22.3089, lon: 113.9219 },
  "青衣": { lat: 22.3442, lon: 114.1100 },
  "石崗": { lat: 22.4361, lon: 114.0847 },
  "荃灣可觀": { lat: 22.3839, lon: 114.1078 },
  "荃灣城門谷": { lat: 22.3756, lon: 114.1247 },
  "香港公園": { lat: 22.2778, lon: 114.1617 },
  "筲箕灣": { lat: 22.2794, lon: 114.2286 },
  "九龍城": { lat: 22.3283, lon: 114.1917 },
  "跑馬地": { lat: 22.2708, lon: 114.1831 },
  "黃大仙": { lat: 22.3422, lon: 114.1931 },
  "赤柱": { lat: 22.2186, lon: 114.2119 },
  "觀塘": { lat: 22.3119, lon: 114.2236 },
  "深水埗": { lat: 22.3303, lon: 114.1594 },
  "啟德跑道公園": { lat: 22.3050, lon: 114.2133 },
  "元朗公園": { lat: 22.4444, lon: 114.0222 },
  "大美督": { lat: 22.4750, lon: 114.2369 },
};

// HKO rainfall district coordinates mapping (English names)
export const HKO_DISTRICTS_EN: Record<string, { lat: number; lon: number }> = {
  "Central & Western District": { lat: 22.2855, lon: 114.1422 },
  "Eastern District": { lat: 22.2842, lon: 114.2244 },
  "Kwai Tsing": { lat: 22.3544, lon: 114.1256 },
  "Islands District": { lat: 22.2611, lon: 113.9456 },
  "North District": { lat: 22.4944, lon: 114.1383 },
  "Sai Kung": { lat: 22.3819, lon: 114.2708 },
  "Sha Tin": { lat: 22.3872, lon: 114.1953 },
  "Southern District": { lat: 22.2458, lon: 114.1556 },
  "Tai Po": { lat: 22.4508, lon: 114.1644 },
  "Tsuen Wan": { lat: 22.3711, lon: 114.1147 },
  "Tuen Mun": { lat: 22.3917, lon: 113.9767 },
  "Wan Chai": { lat: 22.2783, lon: 114.1747 },
  "Yuen Long": { lat: 22.4444, lon: 114.0222 },
  "Yau Tsim Mong": { lat: 22.3183, lon: 114.1694 },
  "Sham Shui Po": { lat: 22.3308, lon: 114.1592 },
  "Kowloon City": { lat: 22.3286, lon: 114.1917 },
  "Wong Tai Sin": { lat: 22.3422, lon: 114.1933 },
  "Kwun Tong": { lat: 22.3119, lon: 114.2236 },
};

// HKO rainfall district coordinates mapping (Traditional Chinese names)
export const HKO_DISTRICTS_TC: Record<string, { lat: number; lon: number }> = {
  "中西區": { lat: 22.2855, lon: 114.1422 },
  "東區": { lat: 22.2842, lon: 114.2244 },
  "葵青": { lat: 22.3544, lon: 114.1256 },
  "離島區": { lat: 22.2611, lon: 113.9456 },
  "北區": { lat: 22.4944, lon: 114.1383 },
  "西貢": { lat: 22.3819, lon: 114.2708 },
  "沙田": { lat: 22.3872, lon: 114.1953 },
  "南區": { lat: 22.2458, lon: 114.1556 },
  "大埔": { lat: 22.4508, lon: 114.1644 },
  "荃灣": { lat: 22.3711, lon: 114.1147 },
  "屯門": { lat: 22.3917, lon: 113.9767 },
  "灣仔": { lat: 22.2783, lon: 114.1747 },
  "元朗": { lat: 22.4444, lon: 114.0222 },
  "油尖旺": { lat: 22.3183, lon: 114.1694 },
  "深水埗": { lat: 22.3308, lon: 114.1592 },
  "九龍城": { lat: 22.3286, lon: 114.1917 },
  "黃大仙": { lat: 22.3422, lon: 114.1933 },
  "觀塘": { lat: 22.3119, lon: 114.2236 },
};

// Calculate distance between two coordinates using Haversine formula (in km)
function getDistanceFromLatLon(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

// Find the nearest station to given coordinates
export function findNearestStation(
  lat: number, 
  lon: number, 
  lang: 'en' | 'tc' = 'en'
): { name: string; distance: number } | null {
  const stations = lang === 'tc' ? HKO_STATIONS_TC : HKO_STATIONS_EN;
  let nearestStation: string | null = null;
  let minDistance = Infinity;

  for (const [name, coords] of Object.entries(stations)) {
    const distance = getDistanceFromLatLon(lat, lon, coords.lat, coords.lon);
    if (distance < minDistance) {
      minDistance = distance;
      nearestStation = name;
    }
  }

  return nearestStation ? { name: nearestStation, distance: minDistance } : null;
}

// Find the nearest district to given coordinates
export function findNearestDistrict(
  lat: number, 
  lon: number, 
  lang: 'en' | 'tc' = 'en'
): { name: string; distance: number } | null {
  const districts = lang === 'tc' ? HKO_DISTRICTS_TC : HKO_DISTRICTS_EN;
  let nearestDistrict: string | null = null;
  let minDistance = Infinity;

  for (const [name, coords] of Object.entries(districts)) {
    const distance = getDistanceFromLatLon(lat, lon, coords.lat, coords.lon);
    if (distance < minDistance) {
      minDistance = distance;
      nearestDistrict = name;
    }
  }

  return nearestDistrict ? { name: nearestDistrict, distance: minDistance } : null;
}

// Get coordinates for a station name
export function getStationCoordinates(
  stationName: string,
  lang: 'en' | 'tc' = 'en'
): { lat: number; lon: number } | null {
  const stations = lang === 'tc' ? HKO_STATIONS_TC : HKO_STATIONS_EN;
  return stations[stationName] || null;
}

// Get coordinates for a district name
export function getDistrictCoordinates(
  districtName: string,
  lang: 'en' | 'tc' = 'en'
): { lat: number; lon: number } | null {
  const districts = lang === 'tc' ? HKO_DISTRICTS_TC : HKO_DISTRICTS_EN;
  return districts[districtName] || null;
}

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
  details?: HKOWarningDetails;
}

export interface HKOWarningDetails {
  contents?: string[];
  subtype?: string;
  updateTime?: string;
}

export interface HKOWarningSummaryResponse {
  [key: string]: HKOWarning;
}

export interface HKOWarningInfoDetail {
  warningStatementCode: string;
  subtype?: string;
  contents?: string[];
  updateTime?: string;
}

export interface HKOWarningInfoResponse {
  details?: HKOWarningInfoDetail[];
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
export async function getHKOCurrentWeather(lang: 'en' | 'tc' = 'en'): Promise<HKOCurrentWeatherResponse> {
  const response = await fetch(`${HKO_API_BASE}?dataType=rhrread&lang=${lang}`);
  if (!response.ok) throw new Error('Failed to fetch HKO current weather');
  return response.json();
}

// Fetch 9-day forecast from HKO
export async function getHKOForecast(lang: 'en' | 'tc' = 'en'): Promise<HKOForecastResponse> {
  const response = await fetch(`${HKO_API_BASE}?dataType=fnd&lang=${lang}`);
  if (!response.ok) throw new Error('Failed to fetch HKO forecast');
  return response.json();
}

// Fetch weather warning summary from HKO
export async function getHKOWarningSummary(lang: 'en' | 'tc' = 'en'): Promise<HKOWarningSummaryResponse> {
  const response = await fetch(`${HKO_API_BASE}?dataType=warnsum&lang=${lang}`);
  if (!response.ok) throw new Error('Failed to fetch HKO warnings');
  return response.json();
}

// Fetch detailed warning info from HKO
export async function getHKOWarningInfo(lang: 'en' | 'tc' = 'en'): Promise<HKOWarningInfoResponse> {
  const response = await fetch(`${HKO_API_BASE}?dataType=warningInfo&lang=${lang}`);
  if (!response.ok) throw new Error('Failed to fetch HKO warning info');
  return response.json();
}

// Get weather for Hong Kong using HKO API
// If lat/lon are provided, find the nearest station for localized readings
export async function getHKOWeather(
  lang: 'en' | 'tc' = 'en',
  lat?: number,
  lon?: number
): Promise<WeatherData & { warnings: HKOWarning[]; nearestStation?: string; nearestDistrict?: string }> {
  const [currentData, forecastData, warningsData, warningInfoData] = await Promise.all([
    getHKOCurrentWeather(lang),
    getHKOForecast(lang),
    getHKOWarningSummary(lang),
    getHKOWarningInfo(lang).catch(() => ({ details: [] } as HKOWarningInfoResponse)), // Gracefully handle if no warnings
  ]);

  // Find nearest station and district if coordinates provided
  let nearestStation: { name: string; distance: number } | null = null;
  let nearestDistrict: { name: string; distance: number } | null = null;
  
  if (lat !== undefined && lon !== undefined) {
    nearestStation = findNearestStation(lat, lon, lang);
    nearestDistrict = findNearestDistrict(lat, lon, lang);
  }

  // Get temperature from nearest station or fallback to Hong Kong Observatory
  const stationName = nearestStation?.name || (lang === 'tc' ? '香港天文台' : 'Hong Kong Observatory');
  const stationTemp = currentData.temperature.data.find(d => d.place === stationName);
  const hkoTemp = stationTemp || currentData.temperature.data.find(d => 
    d.place === 'Hong Kong Observatory' || d.place === '香港天文台'
  );
  
  // Get humidity from Hong Kong Observatory (primary humidity station)
  const hkoHumidity = currentData.humidity.data.find(d => 
    d.place === 'Hong Kong Observatory' || d.place === '香港天文台'
  );
  
  // Calculate average temperature across all stations as fallback
  const avgTemp = currentData.temperature.data.reduce((sum, d) => sum + d.value, 0) / currentData.temperature.data.length;
  
  // Get rainfall from nearest district
  const districtName = nearestDistrict?.name;
  const districtRainfall = districtName 
    ? currentData.rainfall.data.find(d => d.place === districtName)
    : null;
  
  // Get current weather icon
  const currentIcon = currentData.icon?.[0] || 50;
  const isDay = isCurrentlyDay();
  
  // Calculate if it's currently raining from rainfall data (use district or max)
  const maxRainfall = districtRainfall?.max ?? Math.max(...currentData.rainfall.data.map(d => d.max));
  
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

  // Extract warnings with details - match by warningStatementCode
  const warningInfoDetails = warningInfoData.details || [];
  const warnings: HKOWarning[] = Object.entries(warningsData).map(([key, warning]) => {
    // Match warning info by code - the warningStatementCode matches the warning code
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
    current,
    hourly,
    daily,
    warnings,
    nearestStation: nearestStation?.name,
    nearestDistrict: nearestDistrict?.name,
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
