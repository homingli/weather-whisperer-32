/** WMO weather code → human description and emoji icon */

import {
  Sun, Moon, CloudSun, CloudMoon, Cloud, CloudFog, CloudDrizzle, CloudRain,
  CloudSnow, Snowflake, CloudLightning, type LucideIcon,
} from 'lucide-react';

const DESCRIPTION_KEYS: Record<number, string> = {
  0: 'weather.desc.clearSky',
  1: 'weather.desc.mainlyClear',
  2: 'weather.desc.partlyCloudy',
  3: 'weather.desc.overcast',
  45: 'weather.desc.foggy',
  48: 'weather.desc.depositingRimeFog',
  51: 'weather.desc.lightDrizzle',
  53: 'weather.desc.moderateDrizzle',
  55: 'weather.desc.denseDrizzle',
  56: 'weather.desc.freezingDrizzle',
  57: 'weather.desc.denseFreezingDrizzle',
  61: 'weather.desc.slightRain',
  63: 'weather.desc.moderateRain',
  65: 'weather.desc.heavyRain',
  66: 'weather.desc.freezingRain',
  67: 'weather.desc.heavyFreezingRain',
  71: 'weather.desc.slightSnow',
  73: 'weather.desc.moderateSnow',
  75: 'weather.desc.heavySnow',
  77: 'weather.desc.snowGrains',
  80: 'weather.desc.slightRainShowers',
  81: 'weather.desc.moderateRainShowers',
  82: 'weather.desc.violentRainShowers',
  85: 'weather.desc.slightSnowShowers',
  86: 'weather.desc.heavySnowShowers',
  95: 'weather.desc.thunderstorm',
  96: 'weather.desc.thunderstormWithHail',
  99: 'weather.desc.thunderstormWithHeavyHail',
};

/** Translation key for a WMO weather code (e.g. "weather.desc.clearSky") */
export function weatherDescriptionKey(code: number): string {
  return DESCRIPTION_KEYS[code] || 'weather.desc.unknown';
}

/** Human-readable description for a WMO weather code */
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

/** Emoji icon for a WMO weather code, with day/night variants */
export function getWeatherIcon(code: number, isDay: boolean): string {
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

/**
 * Flat (monochrome, currentColor) lucide icon for a WMO weather code.
 * Reads cleanly on both the dark editorial background and the
 * paper-cream light variant — emoji gradients washed out on cream.
 */
const ICON_MAP: Record<number, { day: LucideIcon; night: LucideIcon }> = {
  0:  { day: Sun,            night: Moon },
  1:  { day: CloudSun,       night: CloudMoon },
  2:  { day: CloudSun,       night: CloudMoon },
  3:  { day: Cloud,          night: Cloud },
  45: { day: CloudFog,       night: CloudFog },
  48: { day: CloudFog,       night: CloudFog },
  51: { day: CloudDrizzle,   night: CloudDrizzle },
  53: { day: CloudDrizzle,   night: CloudDrizzle },
  55: { day: CloudDrizzle,   night: CloudDrizzle },
  56: { day: CloudDrizzle,   night: CloudDrizzle },
  57: { day: CloudDrizzle,   night: CloudDrizzle },
  61: { day: CloudRain,      night: CloudRain },
  63: { day: CloudRain,      night: CloudRain },
  65: { day: CloudRain,      night: CloudRain },
  66: { day: CloudRain,      night: CloudRain },
  67: { day: CloudRain,      night: CloudRain },
  71: { day: CloudSnow,      night: CloudSnow },
  73: { day: CloudSnow,      night: CloudSnow },
  75: { day: CloudSnow,      night: CloudSnow },
  77: { day: Snowflake,      night: Snowflake },
  80: { day: CloudRain,      night: CloudRain },
  81: { day: CloudRain,      night: CloudRain },
  82: { day: CloudRain,      night: CloudRain },
  85: { day: CloudSnow,      night: CloudSnow },
  86: { day: CloudSnow,      night: CloudSnow },
  95: { day: CloudLightning, night: CloudLightning },
  96: { day: CloudLightning, night: CloudLightning },
  99: { day: CloudLightning, night: CloudLightning },
};

/** Flat lucide icon component for a WMO weather code (day/night aware). */
export function getWeatherIconNode(code: number, isDay: boolean): LucideIcon {
  const entry = ICON_MAP[code];
  if (entry) return isDay ? entry.day : entry.night;
  return Cloud;
}