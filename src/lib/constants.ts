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
  /** User's preferred unit system: 'metric' (default) or 'us'. */
  UNITS: 'weather-units',
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
  /** HKO warnings / storm signal TTL — push-driven, sub-minute user expectation. Used as the SourceState.ttlMs for HKO since warnings are the most volatile HKO slice in a unified fetch. */
  HKO_WARNINGS_TTL_MS: 60 * 1000,
} as const;