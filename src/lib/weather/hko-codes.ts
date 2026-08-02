/**
 * HKO icon code → human description and lucide icon.
 *
 * HKO's icon taxonomy is more granular than WMO 4677 for current conditions:
 *   - 50–65  day conditions (Sunny → Thunderstorms)
 *   - 70–77  night variants (Clear → Light rain); day/night distinction is
 *             encoded in the code block
 *   - 80–85  special atmospheric states (Windy / Dry / Humid / Fog / Mist /
 *             Haze) — no WMO equivalent
 *   - 90–93  temperature states (Hot / Warm / Cool / Cold) — no WMO equivalent
 *
 * The mapping below mirrors the shape of `codes.ts` (WMO). 60/61/62 and
 * 75/76/77 share wording with their WMO counterparts ("Cloudy", "Overcast",
 * "Light rain") and reuse the `weather.desc.*` translation keys rather than
 * adding parallel `hko.desc.*` keys for identical phrasing.
 *
 * Source for HKO wording: https://www.hko.gov.hk/textonly/v2/explain/wxicon_e.htm
 * Reference also captured in `handoff/hko-wmo-code-mapping.md`.
 *
 * Day vs. night (`isHKODayTime`): codes 50–69 and 80–93 are day; codes 70–77
 * are night. Special-state codes (80–85) are time-agnostic in HKO's data and
 * default to day so the cloud+sun variant picks the daytime icon.
 */

import {
  Sun,
  Moon,
  CloudSun,
  CloudMoon,
  Cloud,
  CloudRain,
  CloudLightning,
  CloudFog,
  Wind,
  Droplets,
  ThermometerSun,
  ThermometerSnowflake,
  type LucideIcon,
} from 'lucide-react';

/** All HKO icon codes this module recognises. */
export const HKO_ICON_CODES: readonly number[] = [
  50, 51, 52, 53, 54, 60, 61, 62, 63, 64, 65,
  70, 71, 72, 73, 74, 75, 76, 77,
  80, 81, 82, 83, 84, 85,
  90, 91, 92, 93,
];

/** Translation key for an HKO icon code. Codes whose EN wording matches a
 *  WMO description reuse the `weather.desc.*` key; everything else gets a
 *  dedicated `hko.desc.*` key. */
const DESCRIPTION_KEYS: Record<number, string> = {
  // Day conditions
  50: 'hko.desc.sunny',
  51: 'hko.desc.sunnyPeriods',
  52: 'hko.desc.sunnyIntervals',
  53: 'hko.desc.sunnyPeriodsFewShowers',
  54: 'hko.desc.sunnyIntervalsShowers',
  60: 'weather.desc.cloudy',     // wording matches WMO 3
  61: 'weather.desc.overcast',   // wording matches WMO 3 (HK keeps "Overcast")
  62: 'weather.desc.lightRain',  // wording matches WMO 61
  63: 'hko.desc.rain',           // HK "Rain" ≠ WMO 63 "Moderate rain"
  64: 'weather.desc.heavyRain',  // wording matches WMO 65
  65: 'hko.desc.thunderstorms',  // plural differs from WMO 95 "Thunderstorm"
  // Night variants (we use "Clear", "Clear periods", etc.; HKO calls these
  // "Fine" but we use natural English that parallels the day wording).
  70: 'hko.desc.clear',
  71: 'hko.desc.clearPeriods',
  72: 'hko.desc.clearIntervals',
  73: 'hko.desc.clearPeriodsFewShowers',
  74: 'hko.desc.clearIntervalsShowers',
  75: 'weather.desc.cloudy',
  76: 'weather.desc.overcast',
  77: 'weather.desc.lightRain',
  // Special atmospheric states — no WMO equivalent
  80: 'hko.desc.windy',
  81: 'hko.desc.dry',
  82: 'hko.desc.humid',
  83: 'hko.desc.fog',            // HK "Fog" ≠ WMO 45 "Foggy"
  84: 'hko.desc.mist',
  85: 'hko.desc.haze',
  // Temperature states — no WMO equivalent
  90: 'hko.desc.hot',
  91: 'hko.desc.warm',
  92: 'hko.desc.cool',
  93: 'hko.desc.cold',
};

/** Translation key for an HKO icon code (e.g. "hko.desc.sunny"). Falls back
 *  to `weather.desc.unknown` for codes outside the recognised range. */
export function hkoDescriptionKey(code: number): string {
  return DESCRIPTION_KEYS[code] || 'weather.desc.unknown';
}

/** Hardcoded EN label for an HKO icon code. These strings seed the
 *  `hko.desc.*` translation table; the production UI reads through
 *  `hkoDescriptionKey()` + the `LanguageContext` so labels render in the
 *  user's selected language. */
const DESCRIPTIONS: Record<number, string> = {
  50: 'Sunny',
  51: 'Sunny periods',
  52: 'Sunny intervals',
  53: 'Sunny periods with a few showers',
  54: 'Sunny intervals with showers',
  60: 'Cloudy',
  61: 'Overcast',
  62: 'Light rain',
  63: 'Rain',
  64: 'Heavy rain',
  65: 'Thunderstorms',
  70: 'Clear',
  71: 'Clear periods',
  72: 'Clear intervals',
  73: 'Clear periods with a few showers',
  74: 'Clear intervals with showers',
  75: 'Cloudy',
  76: 'Overcast',
  77: 'Light rain',
  80: 'Windy',
  81: 'Dry',
  82: 'Humid',
  83: 'Fog',
  84: 'Mist',
  85: 'Haze',
  90: 'Hot',
  91: 'Warm',
  92: 'Cool',
  93: 'Cold',
};

/** Human-readable EN label for an HKO icon code. Falls back to `'Unknown'`
 *  for codes outside the recognised range (e.g. the HKO sentinel 9999). */
export function getHKODescription(code: number): string {
  return DESCRIPTIONS[code] || 'Unknown';
}

/** True when the HKO code represents a daytime state. Codes 50–69 (day
 *  conditions) and 80–93 (time-agnostic special + temperature states,
 *  rendered with the daytime variant) are day; codes 70–77 are night. */
export function isHKODayTime(code: number): boolean {
  if (code >= 70 && code <= 77) return false;
  return (code >= 50 && code <= 69) || (code >= 80 && code <= 93);
}

/** Flat lucide icon for an HKO icon code. Day/night is encoded in the
 *  code itself (50 ↔ 70, 51 ↔ 71, etc.), so callers don't pass `isDay`. */
const ICON_MAP: Record<number, LucideIcon> = {
  50: Sun,
  51: CloudSun,
  52: CloudSun,
  53: CloudSun,
  54: CloudSun,
  60: Cloud,
  61: Cloud,
  62: CloudRain,
  63: CloudRain,
  64: CloudRain,
  65: CloudLightning,
  70: Moon,
  71: CloudMoon,
  72: CloudMoon,
  73: CloudMoon,
  74: CloudMoon,
  75: Cloud,
  76: Cloud,
  77: CloudRain,
  80: Wind,
  81: Sun,                     // "Dry" implies clear; use Sun
  82: Droplets,
  83: CloudFog,
  84: CloudFog,
  85: CloudFog,
  90: ThermometerSun,
  91: ThermometerSun,
  92: ThermometerSnowflake,
  93: ThermometerSnowflake,
};

/** Lucide icon component for an HKO icon code. Falls back to `Cloud` for
 *  unrecognised codes (defensive — `Cloud` is a safe neutral default). */
export function getHKOIconNode(code: number): LucideIcon {
  return ICON_MAP[code] || Cloud;
}