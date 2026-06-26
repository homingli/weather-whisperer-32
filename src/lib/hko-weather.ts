// Hong Kong Observatory Weather API
// API Documentation: https://www.hko.gov.hk/en/weatherAPI/doc/files/HKO_Open_Data_API_Documentation.pdf

import { CurrentWeather, HourlyForecast, DailyForecast, WeatherData } from './weather';

const HKO_API_BASE = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php';
import { fetchWithTimeout } from './fetch-utils';

/**
 * Robust date parsing utility for YYYYMMDD format from HKO API
 * Creates date at midnight in Hong Kong timezone (Asia/Hong_Kong)
 * Replaces brittle parseInt usage with proper validation and error handling
 */
function parseHkoDate(dateStr: string): Date {
  if (!dateStr || dateStr.length !== 8) {
    throw new Error(`Invalid HKO date format: ${dateStr}. Expected YYYYMMDD format.`);
  }
  
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(4, 6)) - 1; // Convert to 0-indexed month
  const dayOfMonth = Number(dateStr.slice(6, 8));
  
  if (isNaN(year) || isNaN(month) || isNaN(dayOfMonth)) {
    throw new Error(`Invalid date numbers in HKO date: ${dateStr}`);
  }
  
  // Create date at midnight in Hong Kong timezone
  // Use noon local time to avoid DST edge cases, then adjust to midnight
  const utcRef = Date.UTC(year, month, dayOfMonth, 12, 0, 0, 0);
  
  // Hong Kong timezone offset (GMT+8, no DST)
  const hkOffset = 8 * 60 * 60 * 1000; // 8 hours in milliseconds
  
  // Return date at local midnight (12:00 local - 12 hours = 00:00 local)
  // Adjust by Hong Kong offset to get the correct UTC time
  const date = new Date(utcRef - 12 * 60 * 60 * 1000 - hkOffset);
  
  // Validate the created date
  if (isNaN(date.getTime())) {
    throw new Error(`Failed to create valid date from HKO date: ${dateStr}`);
  }
  
  return date;
}

// Hong Kong approximate bounding box for coverage detection
const HK_BOUNDS = {
  minLat: 22.15,
  maxLat: 22.56,
  minLon: 113.82,
  maxLon: 114.43,
};

// Check if coordinates are within Hong Kong coverage area
export function isInHongKong(lat: number, lon: number): boolean {
  return (
    lat >= HK_BOUNDS.minLat &&
    lat <= HK_BOUNDS.maxLat &&
    lon >= HK_BOUNDS.minLon &&
    lon <= HK_BOUNDS.maxLon
  );
}

// Pearl River Delta bounding box for the gridded rainfall nowcast map
// Covers Hong Kong + Guangdong China (Shenzhen, Guangzhou, Zhuhai, Macau, etc.)
// Matches the actual HKO F3 nowcast grid extent: ~21.33°N-23.49°N, 112.96°E-115.29°E
const PRD_BOUNDS = {
  minLat: 21.30,
  maxLat: 23.50,
  minLon: 112.95,
  maxLon: 115.30,
};

// Check if coordinates are within the Pearl River Delta rainfall nowcast coverage area
export function isInRainfallRegion(lat: number, lon: number): boolean {
  return (
    lat >= PRD_BOUNDS.minLat &&
    lat <= PRD_BOUNDS.maxLat &&
    lon >= PRD_BOUNDS.minLon &&
    lon <= PRD_BOUNDS.maxLon
  );
}

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

// Local mappings for English ↔ Traditional Chinese names
export const STATION_TC_TO_EN: Record<string, string> = {
  "京士柏": "King's Park",
  "香港天文台": "Hong Kong Observatory",
  "黃竹坑": "Wong Chuk Hang",
  "打鼓嶺": "Ta Kwu Ling",
  "流浮山": "Lau Fau Shan",
  "大埔": "Tai Po",
  "沙田": "Sha Tin",
  "屯門": "Tuen Mun",
  "將軍澳": "Tseung Kwan O",
  "西貢": "Sai Kung",
  "長洲": "Cheung Chau",
  "赤鱲角": "Chek Lap Kok",
  "青衣": "Tsing Yi",
  "石崗": "Shek Kong",
  "荃灣可觀": "Tsuen Wan Ho Koon",
  "荃灣城門谷": "Tsuen Wan Shing Mun Valley",
  "香港公園": "Hong Kong Park",
  "筲箕灣": "Shau Kei Wan",
  "九龍城": "Kowloon City",
  "跑馬地": "Happy Valley",
  "黃大仙": "Wong Tai Sin",
  "赤柱": "Stanley",
  "觀塘": "Kwun Tong",
  "深水埗": "Sham Shui Po",
  "啟德跑道公園": "Kai Tak Runway Park",
  "元朗公園": "Yuen Long Park",
  "大美督": "Tai Mei Tuk",
};

export const STATION_EN_TO_TC: Record<string, string> = Object.fromEntries(
  Object.entries(STATION_TC_TO_EN).map(([tc, en]) => [en, tc])
);

export const DISTRICT_TC_TO_EN: Record<string, string> = {
  "中西區": "Central & Western District",
  "東區": "Eastern District",
  "葵青": "Kwai Tsing",
  "離島區": "Islands District",
  "北區": "North District",
  "西貢": "Sai Kung",
  "沙田": "Sha Tin",
  "南區": "Southern District",
  "大埔": "Tai Po",
  "荃灣": "Tsuen Wan",
  "屯門": "Tuen Mun",
  "灣仔": "Wan Chai",
  "元朗": "Yuen Long",
  "油尖旺": "Yau Tsim Mong",
  "深水埗": "Sham Shui Po",
  "九龍城": "Kowloon City",
  "黃大仙": "Wong Tai Sin",
  "觀塘": "Kwun Tong",
};

export const DISTRICT_EN_TO_TC: Record<string, string> = Object.fromEntries(
  Object.entries(DISTRICT_TC_TO_EN).map(([tc, en]) => [en, tc])
);

// Translation helpers
export function translateStationName(name: string, lang: 'en' | 'tc'): string {
  if (lang === 'tc') {
    return STATION_EN_TO_TC[name] || name;
  }
  return STATION_TC_TO_EN[name] || name;
}

export function translateDistrictName(name: string, lang: 'en' | 'tc'): string {
  if (lang === 'tc') {
    return DISTRICT_EN_TO_TC[name] || name;
  }
  return DISTRICT_TC_TO_EN[name] || name;
}

export function translatePsr(psr: string | undefined, lang: 'en' | 'tc'): string | null {
  if (!psr) return null;
  const labels: Record<string, Record<string, string>> = {
    en: {
      'Low': 'Low',
      'Med Low': 'Med Low',
      'Med': 'Med',
      'Med High': 'Med High',
      'High': 'High',
    },
    tc: {
      'Low': '低',
      'Med Low': '中低',
      'Med': '中',
      'Med High': '中高',
      'High': '高',
    }
  };
  return labels[lang]?.[psr] || psr;
}

export function normalizePsr(psr: string | undefined): string | undefined {
  if (!psr) return undefined;
  const psrMap: Record<string, string> = {
    // English
    'Low': 'Low',
    'Medium Low': 'Med Low',
    'Med Low': 'Med Low',
    'Medium': 'Med',
    'Med': 'Med',
    'Medium High': 'Med High',
    'High': 'High',
    // Chinese
    '低': 'Low',
    '中低': 'Med Low',
    '中': 'Med',
    '中高': 'Med High',
    '高': 'High',
  };
  return psrMap[psr] || undefined;
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
// Supports both English and Traditional Chinese values from HKO API
export function psrToPercentage(psr: string): number {
  const psrMap: Record<string, number> = {
    // English
    'Low': 10,
    'Medium Low': 25,
    'Med Low': 25,
    'Medium': 50,
    'Med': 50,
    'Medium High': 70,
    'High': 85,
    // Traditional Chinese
    '低': 10,
    '中低': 25,
    '中': 50,
    '中高': 70,
    '高': 85,
  };
  return psrMap[psr] || 0;
}

// Check if PSR indicates umbrella needed (Medium Low and above)
export function psrNeedsUmbrella(psr: string | undefined): boolean {
  if (!psr) return false;
  const needsUmbrellaValues = [
    // English
    'Medium Low', 'Med Low', 'Medium', 'Med', 'Medium High', 'High',
    // Traditional Chinese
    '中低', '中', '中高', '高',
  ];
  return needsUmbrellaValues.includes(psr);
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

// Fetch 9-day forecast from HKO
export async function getHKOForecast(lang: 'en' | 'tc' = 'en'): Promise<HKOForecastResponse> {
  const start = Date.now();
  try {
    const response = await fetchWithTimeout(`${HKO_API_BASE}?dataType=fnd&lang=${lang}`, { timeout: 8000 });
    if (!response.ok) throw new Error(`Failed to fetch HKO forecast: ${response.status}`);
    const data = await response.json();
    console.log(`HKO forecast fetch took ${Date.now() - start}ms`);
    return data;
  } catch (err) {
    const label = err instanceof DOMException && err.name === 'TimeoutError' ? 'timeout' : 'error';
    console.log(`HKO forecast ${label} after ${Date.now() - start}ms:`, err);
    throw err;
  }
}

// Fetch weather warning summary from HKO
export async function getHKOWarningSummary(lang: 'en' | 'tc' = 'en'): Promise<HKOWarningSummaryResponse> {
  const start = Date.now();
  try {
    const response = await fetchWithTimeout(`${HKO_API_BASE}?dataType=warnsum&lang=${lang}`, { timeout: 8000 });
    if (!response.ok) throw new Error(`Failed to fetch HKO warnings: ${response.status}`);
    const data = await response.json();
    console.log(`HKO warnings fetch took ${Date.now() - start}ms`);
    return data;
  } catch (err) {
    const label = err instanceof DOMException && err.name === 'TimeoutError' ? 'timeout' : 'error';
    console.log(`HKO warnings ${label} after ${Date.now() - start}ms:`, err);
    throw err;
  }
}

// Fetch detailed warning info from HKO
export async function getHKOWarningInfo(lang: 'en' | 'tc' = 'en'): Promise<HKOWarningInfoResponse> {
  const start = Date.now();
  try {
    const response = await fetchWithTimeout(`${HKO_API_BASE}?dataType=warningInfo&lang=${lang}`, { timeout: 8000 });
    if (!response.ok) throw new Error(`Failed to fetch HKO warning info: ${response.status}`);
    const data = await response.json();
    console.log(`HKO warning info fetch took ${Date.now() - start}ms`);
    return data;
  } catch (err) {
    const label = err instanceof DOMException && err.name === 'TimeoutError' ? 'timeout' : 'error';
    console.log(`HKO warning info ${label} after ${Date.now() - start}ms:`, err);
    throw err;
  }
}

// Get HKO daily forecast and warnings only (for hybrid approach)
export async function getHKODailyAndWarnings(
  lang: 'en' | 'tc' = 'en',
  lat?: number,
  lon?: number
): Promise<{ daily: DailyForecast[]; warnings: HKOWarning[]; nearestStation?: string; nearestDistrict?: string; timezone?: string }> {
  const [forecastData, warningsData, warningInfoData] = await Promise.all([
    getHKOForecast(lang),
    getHKOWarningSummary(lang),
    getHKOWarningInfo(lang).catch(() => ({ details: [] } as HKOWarningInfoResponse)),
  ]);

  // Find nearest station and district if coordinates provided - ALWAYS in English to act as neutral key
  let nearestStation: { name: string; distance: number } | null = null;
  let nearestDistrict: { name: string; distance: number } | null = null;
  
  if (lat !== undefined && lon !== undefined) {
    nearestStation = findNearestStation(lat, lon, 'en');
    nearestDistrict = findNearestDistrict(lat, lon, 'en');
  }

  // Build daily forecast (up to 7 days)
  const daily: DailyForecast[] = forecastData.weatherForecast.slice(0, 7).map(day => {
    const date = parseHkoDate(day.forecastDate);
    
    // We don't provide sunrise/sunset here anymore as Open-Meteo is more accurate
    // and used as the primary source for sun times in the app
    return {
      date,
      temperatureMax: day.forecastMaxtemp.value,
      temperatureMin: day.forecastMintemp.value,
      weatherCode: hkoIconToWeatherCode(day.ForecastIcon),
      precipitationProbabilityMax: psrToPercentage(day.PSR),
      precipitationProbabilityRaw: normalizePsr(day.PSR),
      sunrise: new Date(0), // Placeholder, will be replaced by Open-Meteo data in weather-manager.ts
      sunset: new Date(0),  // Placeholder
    };
  });

  // Extract warnings with details
  const warningInfoDetails = warningInfoData.details || [];
  const warnings: HKOWarning[] = Object.entries(warningsData).map(([key, warning]) => {
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
    daily,
    warnings,
    nearestStation: nearestStation?.name,
    nearestDistrict: nearestDistrict?.name,
    timezone: 'Asia/Hong_Kong',
  };
}

// Fetch current weather from HKO
export async function getHKOCurrentWeather(lang: 'en' | 'tc' = 'en'): Promise<HKOCurrentWeatherResponse> {
  const start = Date.now();
  try {
    const response = await fetchWithTimeout(`${HKO_API_BASE}?dataType=rhrread&lang=${lang}`, { timeout: 8000 });
    if (!response.ok) throw new Error(`Failed to fetch HKO current weather: ${response.status}`);
    const data = await response.json();
    console.log(`HKO current weather fetch took ${Date.now() - start}ms`);
    return data;
  } catch (err) {
    const label = err instanceof DOMException && err.name === 'TimeoutError' ? 'timeout' : 'error';
    console.log(`HKO current weather ${label} after ${Date.now() - start}ms:`, err);
    throw err;
  }
}

// Fetch complete HKO-only weather data as fallback
export async function fetchHKOWeatherData(
  lat: number,
  lon: number,
  lang: 'en' | 'tc' = 'en'
): Promise<WeatherData> {
  const [currentHko, dailyAndWarnings] = await Promise.all([
    getHKOCurrentWeather(lang),
    getHKODailyAndWarnings(lang, lat, lon),
  ]);

  // Find nearest station temperature
  const nearestStation = findNearestStation(lat, lon, lang);
  const stationName = nearestStation?.name || (lang === 'tc' ? '香港天文台' : 'Hong Kong Observatory');
  
  let temperature = 25; // default fallback
  const tempReading = currentHko.temperature.data.find(t => t.place === stationName) 
    || currentHko.temperature.data.find(t => t.place === (lang === 'tc' ? '香港天文台' : 'Hong Kong Observatory'))
    || currentHko.temperature.data[0];
  if (tempReading) {
    temperature = tempReading.value;
  }

  // Humidity
  let humidity = 75; // default fallback
  const humReading = currentHko.humidity.data.find(h => h.place === (lang === 'tc' ? '香港天文台' : 'Hong Kong Observatory'))
    || currentHko.humidity.data[0];
  if (humReading) {
    humidity = humReading.value;
  }

  // Rainfall/Precipitation
  let precipitation = 0;
  const nearestDistrict = findNearestDistrict(lat, lon, lang);
  if (nearestDistrict && currentHko.rainfall && currentHko.rainfall.data) {
    const rainReading = currentHko.rainfall.data.find(r => r.place === nearestDistrict.name);
    if (rainReading) {
      precipitation = rainReading.max;
    }
  }

  // UV index
  let uvIndex = 0;
  if (currentHko.uvindex && currentHko.uvindex.data && currentHko.uvindex.data.length > 0) {
    uvIndex = currentHko.uvindex.data[0].value;
  }

  // Weather Code
  let weatherCode = 3; // Default cloudy
  if (currentHko.icon && currentHko.icon.length > 0) {
    weatherCode = hkoIconToWeatherCode(currentHko.icon[0]);
  }

  // Day/Night status
  const currentHour = new Date().getHours();
  const isDay = currentHour >= 6 && currentHour < 19;

  // Calculate apparent temperature
  // e = (humidity / 100) * 6.105 * exp((17.27 * temp) / (237.7 + temp))
  // AT = temp + 0.33 * e - 4.0
  const eVal = (humidity / 100) * 6.105 * Math.exp((17.27 * temperature) / (237.7 + temperature));
  const apparentTemperature = Math.round(temperature + 0.33 * eVal - 4.0);

  const current: CurrentWeather = {
    temperature,
    apparentTemperature,
    humidity,
    uvIndex,
    weatherCode,
    windSpeed: 0,
    windDirection: 0,
    precipitation,
    precipitationProbability: dailyAndWarnings.daily[0]?.precipitationProbabilityMax || 0,
    precipitationProbabilityRaw: dailyAndWarnings.daily[0]?.precipitationProbabilityRaw,
    isDay,
  };

  // Build a dummy hourly forecast around the current hour since HKO doesn't have it
  // This prevents UI charts from breaking or being completely empty
  const hourly: HourlyForecast[] = [];
  const startHour = new Date();
  startHour.setMinutes(0, 0, 0);
  for (let i = 0; i < 8; i++) {
    const hourTime = new Date(startHour.getTime() + i * 60 * 60 * 1000);
    const hourVal = hourTime.getHours();
    hourly.push({
      time: hourTime,
      temperature: temperature,
      weatherCode: weatherCode,
      windSpeed: 0,
      windDirection: 0,
      precipitationProbability: current.precipitationProbability,
      precipitation: 0,
      isDay: hourVal >= 6 && hourVal < 19,
    });
  }

  return {
    current,
    hourly,
    daily: dailyAndWarnings.daily,
    warnings: dailyAndWarnings.warnings,
    timezone: 'Asia/Hong_Kong',
    nearestStation: dailyAndWarnings.nearestStation,
    nearestDistrict: dailyAndWarnings.nearestDistrict,
    isFallback: true,
    fallbackSource: 'HKO',
  };
}

export function getWarningColor(code: string): string {
  const redWarnings = ['WFIRER', 'WRAINR', 'WRAINB', 'WTMW', 'TC8NE', 'TC8SE', 'TC8NW', 'TC8SW', 'TC9', 'TC10'];
  const yellowWarnings = ['WFIREY', 'WRAINA', 'WTS', 'TC3'];
  
  if (redWarnings.includes(code)) return 'destructive';
  if (yellowWarnings.includes(code)) return 'warning';
  
  return 'secondary';
}

export function getWarningIcon(warningCode: string): string {
  const baseUrl = '/icons/hko-warnings';
  const iconMap: Record<string, string> = {
    'WFIREY': 'firey.gif',
    'WFIRER': 'firer.gif',
    'WFROST': 'frost.gif',
    'WHOT': 'vhot.gif',
    'WCOLD': 'cold.gif',
    'WMSGNL': 'sms.gif',
    'WRAINA': 'raina.gif',
    'WRAINR': 'rainr.gif',
    'WRAINB': 'rainb.gif',
    'WFNTSA': 'ntfl.gif',
    'WL': 'landslip.gif',
    'TC1': 'tc1.gif',
    'TC3': 'tc3.gif',
    'TC8NE': 'tc8ne.gif',
    'TC8SE': 'tc8b.gif',
    'TC8NW': 'tc8d.gif',
    'TC8SW': 'tc8c.gif',
    'TC9': 'tc9.gif',
    'TC10': 'tc10.gif',
    'WTMW': 'tsunami-warn.gif',
    'WTS': 'ts.gif',
  };

  if (iconMap[warningCode]) {
    return `${baseUrl}/${iconMap[warningCode]}`;
  }

  // Fallbacks for base codes
  if (warningCode.startsWith('WFIRE')) return `${baseUrl}/firey.gif`;
  if (warningCode.startsWith('WRAIN')) return `${baseUrl}/raina.gif`;
  if (warningCode.startsWith('TC') || warningCode.startsWith('WTCSGNL')) return `${baseUrl}/tc1.gif`;
  if (warningCode.startsWith('WFNTSA')) return `${baseUrl}/ntfl.gif`;

  // Provide a generic fallback or null, returning warning symbol icon
  return `${baseUrl}/ts.gif`; // or maybe empty
}
