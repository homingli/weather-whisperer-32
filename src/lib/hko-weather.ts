/**
 * HKO (Hong Kong Observatory) weather module.
 * Barrel re-export — all logic lives in split modules.
 */

// Bounds
export { HK_BOUNDS, PRD_BOUNDS, isInHongKong, isInRainfallRegion } from './hko-bounds';

// Stations & districts
export {
  HKO_STATIONS_EN, HKO_STATIONS_TC,
  HKO_DISTRICTS_EN, HKO_DISTRICTS_TC,
  findNearestStation, findNearestDistrict,
  getStationCoordinates, getDistrictCoordinates,
} from './hko-stations';

// Translations
export {
  STATION_TC_TO_EN, STATION_EN_TO_TC,
  DISTRICT_TC_TO_EN, DISTRICT_EN_TO_TC,
  translateStationName, translateDistrictName, translatePsr,
} from './hko-translations';

// PSR
export { normalizePsr, psrToPercentage, psrNeedsUmbrella } from './hko-psr';

// Types are NOT re-exported from this barrel — hko-types.ts is interfaces-only
// and gets compiled to `export { }` at runtime by esbuild/SWC, which breaks any
// runtime re-export named-import. Import types directly from '@/lib/hko-types'.

// Fetch & build
export {
  getHKOForecast, getHKOWarningSummary, getHKOWarningInfo,
  getHKOCurrentWeather, getHKODailyAndWarnings,
  buildHKOWeatherData, fetchHKOWeatherData,
} from './hko-fetch';

// Icons & warnings
export { hkoIconToWeatherCode, getWarningColor, getWarningIcon } from './hko-icons';
