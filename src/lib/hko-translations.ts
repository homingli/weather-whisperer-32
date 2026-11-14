/** HKO station and district name translations (English ↔ Traditional Chinese)
 *
 *  The name pairs live once in hko-stations.ts (HKO_STATIONS /
 *  HKO_DISTRICTS, keyed by English name with a `tc` field); the maps below
 *  are derived from them so a rename can never drift between the two files. */

import { HKO_STATIONS, HKO_DISTRICTS } from './hko-stations';

export const STATION_TC_TO_EN: Record<string, string> = Object.fromEntries(
  Object.entries(HKO_STATIONS).map(([en, place]) => [place.tc, en])
);

export const STATION_EN_TO_TC: Record<string, string> = Object.fromEntries(
  Object.entries(HKO_STATIONS).map(([en, place]) => [en, place.tc])
);

export const DISTRICT_TC_TO_EN: Record<string, string> = Object.fromEntries(
  Object.entries(HKO_DISTRICTS).map(([en, place]) => [place.tc, en])
);

export const DISTRICT_EN_TO_TC: Record<string, string> = Object.fromEntries(
  Object.entries(HKO_DISTRICTS).map(([en, place]) => [en, place.tc])
);

/** Translate station name between English and Traditional Chinese */
export function translateStationName(name: string, lang: 'en' | 'tc'): string {
  if (lang === 'tc') {
    return STATION_EN_TO_TC[name] || name;
  }
  return STATION_TC_TO_EN[name] || name;
}

/** Translate district name between English and Traditional Chinese */
export function translateDistrictName(name: string, lang: 'en' | 'tc'): string {
  if (lang === 'tc') {
    return DISTRICT_EN_TO_TC[name] || name;
  }
  return DISTRICT_TC_TO_EN[name] || name;
}

/** Translate PSR labels between English and Traditional Chinese */
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
