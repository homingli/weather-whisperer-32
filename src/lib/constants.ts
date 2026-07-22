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
  /** HKO warnings / storm signal TTL — push-driven, sub-minute user expectation. Used as the SourceState.ttlMs for HKO since warnings are the most volatile HKO slice in a unified fetch. */
  HKO_WARNINGS_TTL_MS: 60 * 1000,
} as const;