/** Centralized constants: placeholder sentinels, storage keys, and timing values */

// ---------------------------------------------------------------------------
// Placeholder sentinels
// ---------------------------------------------------------------------------
// Used by PLACEHOLDER_CURRENT in Index.tsx and CurrentWeather.tsx.
// A value < SENTINEL_THRESHOLD means "no data yet — render - instead."
export const PLACEHOLDER_SENTINEL = -999;
export const SENTINEL_THRESHOLD = -100;

// ---------------------------------------------------------------------------
// localStorage keys
// ---------------------------------------------------------------------------
export const STORAGE_KEYS = {
  LANGUAGE: 'weather-language',
  THEME_MODE: 'theme-mode',
  DEFAULT_CITY: 'weather-default-city',
  RECENT_CITIES: 'weather-recent-cities',
  /** Last-known weather snapshot for cold-start first paint. Schema-versioned. */
  LAST_KNOWN: 'weather-last-known-v1',
} as const;

/** Bump when the LastKnownEnvelope shape changes; readers drop on mismatch. */
export const LAST_KNOWN_SCHEMA_VERSION = 1 as const;

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
  /** Gridded rainfall nowcast CSV fetch timeout (10s — 2.7MB file on slow mobile) */
  NOWCAST_TIMEOUT_MS: 10000,
  /** Gridded rainfall nowcast background refetch interval (matches HKO 30-min generation cadence) */
  NOWCAST_REFETCH_INTERVAL_MS: 30 * 60 * 1000,
  /** Open-Meteo daily forecast staleTime — daily fields change a few times per day at most */
  OM_FORECAST_TTL_MS: 30 * 60 * 1000,
  /** Open-Meteo daily forecast refetchInterval */
  OM_FORECAST_REFETCH_MS: 30 * 60 * 1000,
  /** HKO warnings / storm signal staleTime — push-driven, sub-minute user expectation */
  HKO_WARNINGS_TTL_MS: 60 * 1000,
  /** HKO warnings / storm signal refetchInterval */
  HKO_WARNINGS_REFETCH_MS: 60 * 1000,
  /** HKO 9-day forecast staleTime (matches HKO update cadence) */
  HKO_FORECAST_TTL_MS: 30 * 60 * 1000,
  /** HKO 9-day forecast refetchInterval */
  HKO_FORECAST_REFETCH_MS: 30 * 60 * 1000,
  /** Geocoding + reverse-geocode staleTime — place names are stable */
  GEOCODING_TTL_MS: 7 * 24 * 60 * 60 * 1000,
  /** Geocoding + reverse-geocode refetchInterval */
  GEOCODING_REFETCH_MS: 7 * 24 * 60 * 60 * 1000,
} as const;