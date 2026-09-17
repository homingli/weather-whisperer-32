/** Centralized constants: placeholder sentinels, storage keys, and timing values */

// ---------------------------------------------------------------------------
// Placeholder sentinels
// ---------------------------------------------------------------------------
// Used by PLACEHOLDER_CURRENT in Index.tsx and CurrentWeather.tsx.
// A value < SENTINEL_THRESHOLD means "no data yet — render - instead."
export const PLACEHOLDER_SENTINEL = -999;
export const SENTINEL_THRESHOLD = -100;

// ---------------------------------------------------------------------------
// Quiet-metric thresholds (CurrentWeather "quiet shelf")
// ---------------------------------------------------------------------------
// A metric at or below its threshold is "nothing to act on" and collapses
// to an icon-only chip in the quiet shelf; the value is revealed on hover,
// tap, or keyboard focus. High values always render the full widget.
// Empty data (SENTINEL_THRESHOLD) is a separate state and never goes quiet.
export const QUIET = {
  /** Below the nowcast "trace" cutoff (0.5 mm) — no measurable rain. */
  PRECIP_MM: 0.5,
  /** UV below 3 is WHO "Low" (0–2): no sun protection needed. */
  UV_MAX: 3,
  /** Comfortable humidity band (inclusive) — below is dry, above is muggy. */
  HUMIDITY_MIN: 30,
  HUMIDITY_MAX: 60,
  /** Calm wind (raw value is always km/h) — below this, compass direction is noise. */
  WIND_KMH: 20,
  /** AQHI in EPD's "Low" band (1–3): no health precaution needed. */
  AQHI_MAX: 3,
} as const;

// ---------------------------------------------------------------------------
// localStorage keys
// ---------------------------------------------------------------------------
export const STORAGE_KEYS = {
  LANGUAGE: 'weather-language',
  THEME_MODE: 'theme-mode',
  /** User's preferred unit system: 'metric' (default) or 'us'. */
  UNITS: 'weather-units',
  /** User's preferred UI text scale: 'small' | 'medium' (default) | 'large'.
   *  Applied as a percentage root font-size so all rem-based Tailwind
   *  spacing/typography scale with it (see FontSizeContext). */
  FONT_SIZE: 'weather-font-size',
  DEFAULT_CITY: 'weather-default-city',
  RECENT_CITIES: 'weather-recent-cities',
  /** Last-known weather snapshot for cold-start first paint. Schema-versioned. */
  LAST_KNOWN: 'weather-last-known-v2',
  /** Gridded rainfall nowcast CSV snapshot. Read at mount to skip the
   *  "Load Map" prompt when fresh (≤ NOWCAST_CACHE_TTL_MS). Schema-versioned. */
  NOWCAST_CACHE: 'weather-nowcast-cache-v2',
} as const;

/** Bump when the LastKnownEnvelope shape changes; readers drop on mismatch.
 *  v2 — added the required `WeatherData.headline` field (HKO headline icon
 *  plan). Old v1 snapshots are missing `headline`, which crashes the
 *  `CurrentWeather` render path that reads `headline.source`. Dropping on
 *  mismatch lets users see a brief loading state (FetchingStatus overlay)
 *  while the live fetch populates the new shape; the alternative is
 *  optional propagation in `CurrentWeather` (added in tandem as a defensive
 *  guard against future shape drift). */
export const LAST_KNOWN_SCHEMA_VERSION = 2 as const;

/** Bump when the NowcastCacheEnvelope shape changes; readers drop on mismatch.
 *  v2 = LZString-compressed csvText (was raw CSV in v1). */
export const NOWCAST_CACHE_SCHEMA_VERSION = 2 as const;

// ---------------------------------------------------------------------------
// MSC (Meteorological Service of Canada) nowcast — GeoMet WMS
// ---------------------------------------------------------------------------
// The Vancouver nowcast is rendered from pre-rendered per-step WMS tiles
// served by GeoMet (geo.weather.gc.ca). No GRIB2 files are fetched or parsed
// (verified 2026-08-07: HRDPS grid template 262 is unsupported by the only
// maintained browser GRIB2 lib, and the data is JPEG2000-packed). GeoMet sends
// Access-Control-Allow-Origin: * and Cache-Control: max-age=3600.
// MSC layer/style names as standalone consts so the WMS tile requests all
// reference the same strings — a rename here can't silently diverge the tile
// requests from each other (review issue 6).
const MSC_LAYER = 'HRDPS-WEonG_2.5km_TotalPrecipIntensityIndex';
const MSC_STYLE = 'TotalPrecipIntensityIndex_Dis';

export const MSC = {
  /** GeoMet WMS endpoint (CORS *, HTTP max-age=3600). */
  WMS_URL: 'https://geo.weather.gc.ca/geomet',
  /** HRDPS Weather-Elements-on-Grid total precipitation intensity index. */
  LAYER: MSC_LAYER,
  /** GeoMet's discrete intensity color style (yellow → green → orange). */
  STYLE: MSC_STYLE,

  /** Forecast steps relative to the latest published run (1h..6h). The MSC
   *  source publishes no 0h step (verified: GRIB2 PT000H absent; WMS TIME
   *  dimension starts at run+1h). */
  STEP_HOURS: [1, 2, 3, 4, 5, 6] as const,
  /** Publish-lag guard: a run is only treated as published once it has been
   *  running for this many hours (HRDPS files appear ~1-2h after run start).
   *  Verified 2026-08-07 at 00:54Z/01:23Z: 18Z still latest while 00Z had
   *  not yet published. */
  RUN_PUBLISH_LAG_HOURS: 2,
} as const;

/** Vancouver metro coverage box (48.9-49.5°N / 122.3-124.0°W). */
export const VANCOUVER_BBOX = {
  north: 49.5,
  south: 48.9,
  west: -124.0,
  east: -122.3,
} as const;

/** Initial map center for the MSC nowcast. */
export const VANCOUVER_CENTER: [number, number] = [49.28, -123.12];

/** Check if coordinates are within the Vancouver nowcast coverage area. */
export function isInVancouverBox(lat: number, lon: number): boolean {
  return (
    lat >= VANCOUVER_BBOX.south &&
    lat <= VANCOUVER_BBOX.north &&
    lon >= VANCOUVER_BBOX.west &&
    lon <= VANCOUVER_BBOX.east
  );
}

// ---------------------------------------------------------------------------
// Timing constants (milliseconds)
// ---------------------------------------------------------------------------
export const TIMING = {
  /** Open-Meteo forecast API timeout */
  OPEN_METEO_TIMEOUT_MS: 6000,
  /** HKO Open Data API timeout */
  HKO_TIMEOUT_MS: 8000,
  /** Default timeout for fetchWithTimeout when caller doesn't pass one */
  FETCH_DEFAULT_TIMEOUT_MS: 8000,
  /** Nominatim reverse-geocode timeout */
  REVERSE_GEOCODE_TIMEOUT_MS: 4000,
  /** Browser geolocation timeout */
  GEOLOCATION_TIMEOUT_MS: 5000,
  /** React Query staleTime for weather data */
  STALE_TIME_MS: 5 * 60 * 1000,
  /** React Query refetchInterval for weather data */
  REFETCH_INTERVAL_MS: 5 * 60 * 1000,
  /** Faster retry when last fetch failed */
  REFETCH_ON_FAILURE_MS: 60 * 1000,
  /** Auto-mode theme tick to re-evaluate sunrise/sunset */
  THEME_AUTO_TICK_MS: 5 * 60 * 1000,
  /** Rainfall timeline autoplay step interval */
  RAINFALL_AUTOPLAY_MS: 1500,
  /** Gridded rainfall nowcast CSV fetch timeout (30s — 2.7 MB file; covers
   *  the body stream on slow mobile, not just headers). */
  NOWCAST_TIMEOUT_MS: 30000,
  /** Gridded rainfall nowcast background refetch interval (matches HKO 30-min generation cadence) */
  NOWCAST_REFETCH_INTERVAL_MS: 30 * 60 * 1000,
  /** Gridded rainfall nowcast localStorage cache TTL. Within this window,
   *  the CSV is served from cache (skip "Load Map" prompt + skip network).
   *  Aligned with HKO's 30-min generation cadence so the next refetch always
   *  sees a fresh file (worst case: cache expires 5 min before next file). */
  NOWCAST_CACHE_TTL_MS: 15 * 60 * 1000,
  /** MSC GeoMet tile fetch timeout (30s — matches the HKO nowcast fetch). */
  MSC_TIMEOUT_MS: 30000,
  /** HKO warnings / storm signal TTL — push-driven, sub-minute user expectation. Used as the SourceState.ttlMs for HKO since warnings are the most volatile HKO slice in a unified fetch. */
  HKO_WARNINGS_TTL_MS: 60 * 1000,
} as const;