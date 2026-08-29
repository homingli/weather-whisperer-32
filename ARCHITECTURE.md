# Architecture

## Data flow diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER LOCATION                                   │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│         localStorage last-known snapshot (synchronous cold-start seed)       │
│                                                                             │
│   Key: 'weather-last-known-v1' (schema-versioned)                          │
│   Envelope: { v, cityId, lang, fetchedAt, data }                           │
│   Cleared on city switch; overwritten on every successful fetch.           │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ initialData (forced stale, refs the in-memory
                                │ queryKey but reads localStorage synchronously
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    weather-manager.ts (orchestrator)                         │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  isInHongKong(lat, lon)                                             │   │
│   │  ├─ false → Open-Meteo only                                         │   │
│   │  └─ true  → Promise.all([Open-Meteo, HKO]) → merge                 │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   Populates WeatherData.sources: { om, hko } per-source { ok, cachedAt,    │
│   ttlMs, isExpired }. Sets fallbackSource ('HKO' | 'partial' | undefined). │
│   Writes to localStorage on any successful fetch.                          │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                ▼                               ▼
┌───────────────────────────┐   ┌───────────────────────────────────────────┐
│     Open-Meteo API        │   │         HKO API                           │
│  (api.open-meteo.com)    │   │    (data.weather.gov.hk)                  │
│                           │   │                                           │
│  • Current weather       │   │  • 9-day forecast (daily)                 │
│  • Hourly forecast       │   │  • Current conditions                     │
│  • Sunrise/sunset        │   │  • Warning signals (warnsum)              │
│  • WMO weather codes     │   │  • Warning details (warninfo)             │
│                           │   │                                           │
│                           │   │  /hko-data/* in dev (Vite proxy) /       │
│                           │   │  prod (Vercel rewrite) → local origin    │
└───────────────────────────┘   └───────────────────────────────────────────┘
                │                               │
                └───────────────┬───────────────┘
                                │ merge
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         React Query (in-memory)                              │
│                                                                             │
│   Query Key: ['weather-unified', language, lat, lon]                        │
│                                                                             │
│   ┌──────────────────────────────┐  ┌────────────────────────────────────┐ │
│   │  Per-source TTL via sources  │  │  Retry: 1 (2 total attempts)       │ │
│   │  OM: 5min (current/hourly)   │  │  exponential backoff: 1s → 2s     │ │
│   │  HKO: 1min (warnings)        │  │                                    │ │
│   │  collapses to 1min on failure│  │                                    │ │
│   └──────────────────────────────┘  └────────────────────────────────────┘ │
│                                                                             │
│   Hook augmentation: when query.error && query.data, sets                  │
│   fallbackSource: 'cache' (data was the cold-start seed).                  │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Service Worker (cross-session)                         │
│                                                                             │
│   NetworkFirst strategy, two cache buckets:                                │
│   • 'api-cache': external hosts api.open-meteo.com, geocoding-api.open-   │
│     meteo.com, data.weather.gov.hk, nominatim.openstreetmap.org           │
│   • 'hko-proxy-cache': local origin /hko-data/* (dev Vite proxy +         │
│     prod Vercel rewrite), keeping dev and prod offline behavior aligned   │
│   Cache: 50 entries, 1-day TTL per bucket                                  │
│                                                                             │
│   ┌──────────────────┐  ┌──────────────────────────────────────────────┐   │
│   │ Online: network  │  │  Offline: replay cached response              │   │
│   │ wins (fresh)     │  │  (survives tab close, not SW update)        │   │
│   └──────────────────┘  └──────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           UI Components                                      │
│                                                                             │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│   │CurrentWeather│  │HourlyForecast│  │DailyForecast │  │WeatherAlerts │  │
│   └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                                             │
│   ┌──────────────┐  ┌──────────────┐  ┌───────────────────────────────┐    │
│   │  RainfallMap │  │  SettingsMenu│  │       WeatherBanners          │    │
│   │  (separate   │  │  (language,  │  │  'HKO' (legacy, amber)        │    │
│   │   query)     │  │   theme,     │  │  'partial' (amber, source name) │  │
│   └──────────────┘  │   city)      │  │  'cache'   (red, timestamp,    │    │
│                     └──────────────┘  │   refetch button)             │    │
│                                      └───────────────────────────────┘    │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        localStorage (prefs + cold-start seed)                │
│                                                                             │
│   weather-language  ·  theme-mode  ·  weather-default-city  ·              │
│   weather-recent-cities  ·  weather-last-known-v1 (envelope)              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key caching layers (innermost → outermost, read top-down on cold load):**
1. **localStorage last-known snapshot.** Schema-versioned envelope at `weather-last-known-v1`. Read synchronously at mount, used as React Query `initialData` with `initialDataUpdatedAt: 0` so the background fetch fires immediately. Cleared on city switch; overwritten on every successful fetch.
2. **React Query.** Per-tab in-memory, the single source of truth at runtime. `staleTime` and `refetchInterval` collapse to 1 min when any source has failed. The hook augments cached-but-failed data with `fallbackSource: 'cache'`.
3. **Service worker.** Workbox `NetworkFirst` for 5 host patterns across two cache buckets, 50 entries / 24h each. Survives tab close; not a service worker update.
4. **Browser cache.** HTTP-level `Cache-Control`, where the origin sends it.
5. **localStorage user prefs.** Language, theme, default city, recent cities.

## Overview
Weather Whisperer is a weather dashboard built with React and TypeScript. It uses two data sources: Open-Meteo for global coverage, and the Hong Kong Observatory (HKO) API for granular local data when the location is in Hong Kong or the Pearl River Delta.

## Technology stack
- **Framework**: React 18
- **Build Tool**: Vite 5
- **Language**: TypeScript 5
- **Data fetching and caching**: TanStack React Query 5 (sole owner of TTL, dedup, and refetch intervals; no app-level API cache layer)
- **Styling**: Tailwind CSS 3, custom CSS animations (`index.css`), `clsx` + `tailwind-merge`
- **UI Components**: shadcn-ui (Radix UI primitives)
- **Charts**: Recharts 2 (Hourly and Daily visualizations)
- **Map**: MapLibre GL JS (CARTO vector basemap, HKO GeoJSON rainfall layer, MSC WMS raster layer)
- **Routing**: React Router 7
- **Date and time**: `date-fns` 3
- **Icons**: Lucide React
- **PWA**: `vite-plugin-pwa` with `NetworkFirst` service worker routing for external APIs.

## Project structure
- `src/components/`: Reusable React components
  - `ui/`: shadcn-ui primitives in use: `button`, `card`, `dialog`, `dropdown-menu`, `input`, `label`, `separator`, `sheet`, `skeleton`, `sonner`
  - `CurrentWeather.tsx`: Hero section displaying real-time conditions
  - `HourlyForecast.tsx`: Interactive 6-hour line chart (temperature & precipitation); day/night `ReferenceArea` bands and sun-event `ReferenceLine` markers when `daily` prop is provided
  - `DailyForecast.tsx`: 7-day forecast with min/max bounds
  - `RainfallMap.tsx`: Interactive MapLibre map visualizing HKO's gridded rainfall nowcast. CSV is parsed into `RainGrid`, then converted client-side to GeoJSON using `[longitude, latitude]` coordinates. Time-slider controls render above map.
  - `SettingsMenu.tsx`: Global settings controls (Language, Theme, Location, manual refresh)
  - `WeatherAlerts.tsx`: HKO warning icons in the top bar; tapping opens a modal with the full safety text. Tap targets are **44×44 CSS px on mobile (WCAG 2.5.5 AAA)** with 28px icons, and 48×48 with 32px icons on `sm+`. Cancellation filter is case-insensitive on `actionCode` against `"CANCEL"`. HKO returns uppercase; a previous mixed-case compare silently let a cancelled amber rainstorm stay visible until 2026-07-31.
- `src/contexts/`: Global application state
  - `LanguageContext.tsx`: Manages i18n between English and Traditional Chinese (HK)
  - `ThemeContext.tsx`: Manages active theme (Light, Dark, and Sun-synced Auto)
  - `UnitsContext.tsx`: Manages unit preference (metric/US), persisted to localStorage
- `src/hooks/`: React hooks
  - `usePwaInstall.ts`: Tracks `beforeinstallprompt` and provides an `install()` helper
  - `useOnlineStatus.ts`: Returns `online`/`offline` boolean
  - `useSelectedCity.ts`: City init, geo-swap, persistence wrapper
  - `useWeatherWithProgress.ts`: `useQuery` wrapper with `loadProgress` per-source status, faster retry on failure
- `src/lib/`: Core business logic and integrations
  - `weather.ts` (barrel): re-exports from sub-modules
  - `weather/open-meteo.ts`: Open-Meteo API client + parameter assembly
  - `weather/geocoding.ts`: City search, reverse geocode, user location
  - `weather/storage.ts`: Default/recent city persistence helpers
  - `weather/codes.ts`: WMO weather-code to description/icon mapping
  - `weather/types.ts`: `GeoLocation`, `WeatherData`, `CurrentWeather`, `HourlyForecast`, `DailyForecast` interfaces
  - `hko-weather.ts` (barrel): re-exports from sub-modules
  - `hko-types.ts`: HKO API response interfaces (`HKOCurrentWeatherResponse`, `HKOForecastResponse`, `HKOWarning`, `HKOWarningSummaryResponse`)
  - `hko-bounds.ts`: `HK_BOUNDS`, `PRD_BOUNDS`, `isInHongKong`, `isInRainfallRegion`
  - `hko-stations.ts`: HKO stations + districts lookups (`findNearestStation`, `findNearestDistrict`, `get*Coordinates`)
  - `hko-translations.ts`: Station/district name translations (en ↔ tc)
  - `hko-psr.ts`: PSR ladder constant + `normalizePsr`, `psrToPercentage`, `psrNeedsUmbrella`
  - `hko-fetch.ts`: `hkoFetch<T>` base fetcher (8s timeout), plus data builders
  - `hko-icons.ts`: HKO icon → WMO code mapping, warning colors/icons
  - `weather-manager.ts`: Unified orchestrator and the single entry point; merges Open-Meteo + HKO with parallel fetching, fault tolerance, and progress callbacks
  - `constants.ts`: `STORAGE_KEYS` and `TIMING` maps (centralized)
  - `fetch-utils.ts`: Shared `fetchWithTimeout`
  - `utils.ts`: Generic `cn()` and formatting helpers
  - `log.ts`: Conditional `console.*` logger (strips in production)
  - `devWarningSimulator.ts`: Dev-only simulated warnings store on `useSyncExternalStore` (`devAddWarning`, `devRemoveWarning`, `devClearWarnings`, `devResetBaseline`). Production returns empty arrays and zero nonce.
- `src/pages/`: Application routing layers
  - `Index.tsx`: Main dashboard layout with grid/flex responsiveness
  - `NotFound.tsx`: 404 handler
- `src/test/`: Vitest setup
  - `setup.ts`: Global test setup (jest-dom matchers, mocks)
  - `Integration.test.tsx`: Cross-component integration coverage for `CurrentWeather` + `HourlyForecast`
- `src/contexts/` (tests):
  - `LanguageContext.test.tsx`: language toggle, localStorage persistence, translation lookup.
  - `ThemeContext.test.tsx`: light/dark/auto modes, sun-synced auto, localStorage persistence.
- `src/hooks/` (tests):
  - `useWarningChangeDetector.test.ts`: diff logic for added/removed warnings, baseline reset on key change, empty state handling.
- Entry points: `src/main.tsx` (root render) and `src/App.tsx` (providers, router, error boundary)

## Key logic concepts

### Unified weather gateway
The orchestrator at `src/lib/weather-manager.ts` is the single point of entry for all weather data. It manages:
- **Location routing.** `isInHongKong(lat, lon)` toggles HKO enhancements. The rainfall map uses a broader `isInRainfallRegion(lat, lon)` check (Pearl River Delta) so Shenzhen and Guangzhou users also see nowcast data.
- **Hybrid fetching.** Open-Meteo (primary, global) and HKO (secondary, HK-only) run in parallel via `Promise.all`.
- **Merging.** HKO daily entries merge onto Open-Meteo's frame; Open-Meteo's sunrise/sunset takes precedence over HKO placeholders.
- **Fault tolerance.** If HKO fails, Open-Meteo is returned with `hkoFailed: true` (banner shown in UI). If Open-Meteo fails and HKO succeeds, the gateway falls back to HKO-only data. If both fail, the error propagates to React Query.

### Caching and retry strategy

#### Three-tier cache (read top-down on cold load)

1. **localStorage last-known snapshot** (`weather-last-known-v1`).
   Schema-versioned envelope: `{ v, cityId, lang, fetchedAt, data }`. Read
   synchronously at mount; used as React Query `initialData` with
   `initialDataUpdatedAt: 0` so the background fetch fires immediately.
   Cleared on city switch; overwritten on every successful fetch.

2. **React Query** (in-memory, per-tab). Single source of truth at runtime.
   Per-source `sources: { om, hko }` field on every return drives the UI's
   banner tone (none / amber / red).

3. **Workbox Service Worker** (Cache Storage API, cross-session). Two
   `NetworkFirst` buckets, both 50 entries / 24h.

The hook augments cached-but-failed data with `fallbackSource: 'cache'`
when `query.error && query.data`, so the red offline banner can render
without the orchestrator having to handle that path itself.

#### React Query (in-memory, per-tab)
Two `useQuery` consumers in `src/hooks/useWeatherWithProgress.ts` and `src/components/RainfallMap.tsx`. Global `QueryClient` default `retry: 1` set in `src/App.tsx`.

**Query 1: `weather-unified`**
```ts
useQuery({
  queryKey: ['weather-unified', language, latitude, longitude],
  queryFn: () => fetchWeather(lat, lon, lang, onProgress),
  enabled: latitude !== undefined && longitude !== undefined,
  refetchInterval: hasFailure ? TIMING.REFETCH_ON_FAILURE_MS : TIMING.REFETCH_INTERVAL_MS,
  staleTime: hasFailure ? TIMING.REFETCH_ON_FAILURE_MS : TIMING.STALE_TIME_MS,
  placeholderData: 'keepPreviousData',
  initialData: readLastKnownWeather(cityId)?.data,
  initialDataUpdatedAt: 0,
});
```

**Query key shape.** `[language, lat, lon]` (language plus WGS-84 coordinates). Geolocation jitter is filtered upstream; `selectedCity` only swaps if `|Δlat| > 0.01 || |Δlon| > 0.01` (~1.1 km).

**Per-source TTL matrix.** Only the most-volatile slice for each source is enforced today, because `fetchWeather` returns a unified `WeatherData` blob per source. Per-field TTLs would require splitting the orchestrator into per-source-call paths, which is out of scope. The constants are on `TIMING` in `src/lib/constants.ts`:

| Source | Effective TTL | Rationale |
|---|---|---|
| OM | `STALE_TIME_MS` (5 min) | OM current/hourly is the volatile slice (OM updates ~hourly) |
| HKO | `HKO_WARNINGS_TTL_MS` (1 min) | Warnings are the volatile slice (push-driven, sub-minute expectation) |
| Nowcast (RainfallMap) | `NOWCAST_REFETCH_INTERVAL_MS` (30 min) | HKO ~6 min generation cadence; 30 min is comfortable |

Geocoding and Nominatim reverse geocoding are direct fetches today (not React Query queries), so they have no app-level TTL. The Workbox `api-cache` bucket covers offline replay.

`hasFailure` is derived from `weather.sources` (`om.ok && hko.ok`) and
relaxes back to healthy cadence on next success.

**Query 2: `hkoGriddedRainfallNowcast`**
```ts
useQuery({
  queryKey: ['hkoGriddedRainfallNowcast'],
  queryFn: fetchRainfallNowcast,
  staleTime: 5 * 60_000,
  refetchInterval: 5 * 60_000,
  enabled: isLoaded,
});
```
Single global key, shared across all users. Failure-mode shortening not implemented.

#### Per-source state

`WeatherData.sources` carries per-source freshness:

```ts
export type SourceState = {
  ok: boolean;          // did the most recent fetch attempt for this source succeed?
  cachedAt: number;     // epoch ms of last successful fetch for this source
  ttlMs: number;        // source-specific TTL
  isExpired: boolean;   // Date.now() - cachedAt > ttlMs
};
```

`ok: true` always implies `isExpired: false` (the orchestrator overwrites on success). On failure, `cachedAt` is 0 unless the hook backfills from the localStorage snapshot. That backfill is intentionally left out of the orchestrator to keep it small.

**Known corner case (accepted).** The red offline banner in `WeatherBanners.tsx` shows a timestamp via `mostRecentCachedAt(weather)`, which returns the max of `om.cachedAt` and `hko.cachedAt` (filtering 0s). When the rendered payload comes from a `localStorage` snapshot whose previous fetch was itself a partial (e.g. OM ok, HKO failed at snapshot time), `snapshot.sources.hko.cachedAt = 0` and the banner falls back to OM's timestamp. That is the time of the last successful OM fetch, not the time the partial payload was assembled. This reads as "cached from <OM fetch time>" when only OM was ever cached, which is mildly misleading but harmless. The red banner only renders when both APIs are down, and the working-source timestamp is still an honest upper bound on staleness. Fixing it would require either the orchestrator backfilling from the snapshot (a 5-line change in `weather-manager.ts`) or a separate `snapshotAssembledAt` timestamp on the envelope.

`fallbackSource` values:
- `undefined`: both sources live
- `'HKO'`: OM unavailable; the HKO-only fallback path produced the data (legacy banner)
- `'partial'`: one source live, the other failed (amber banner names the working one)
- `'cache'`: set by the hook, not the orchestrator, when `query.error && query.data`

#### Retry mechanism
- Global default `retry: 1` in `src/App.tsx` → **2 total attempts** (1 initial + 1 retry) per error
- `retryDelay`: React Query v5 default `(attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)` → exponential backoff: 1s → 2s → 4s, capped at 30s
- RainfallMap explicitly sets `retry: 0` (nowcast has its own cadence; retrying immediately is wasteful)

Retries are **coarse-grained**: each one re-runs the entire `queryFn`, including all parallel fetches and fallback logic. No per-leg retry, no circuit breaker, no `retryOnError` predicate.

All non-2xx responses throw and are retried equally. Manual `refetch()` does not reset `failureCount` or `retryDelay`. On full failure the React Query retry kicks in; the localStorage snapshot keeps the UI populated so the user sees the red offline banner instead of an error message.

#### Service worker (persistent, cross-session)
Configured in `vite.config.ts` via `vite-plugin-pwa` with Workbox `NetworkFirst`:

```ts
runtimeCaching: [
  {
    urlPattern: /^https:\/\/(api\.open-meteo\.com|geocoding-api\.open-meteo\.com|data\.weather\.gov\.hk|nominatim\.openstreetmap\.org)\/.*/i,
    handler: 'NetworkFirst',
    options: { cacheName: 'api-cache', expiration: { maxEntries: 50, maxAgeSeconds: 86400 }, cacheableResponse: { statuses: [0, 200] } }
  },
  {
    urlPattern: /\/hko-data\/.*/i,
    handler: 'NetworkFirst',
    options: { cacheName: 'hko-proxy-cache', expiration: { maxEntries: 50, maxAgeSeconds: 86400 }, cacheableResponse: { statuses: [0, 200] } }
  },
]
```

The second bucket exists for dev/prod parity. In dev the Vite proxy rewrites the request; in prod a Vercel rewrite does. Either way the browser-visible URL is the local origin, not `data.weather.gov.hk`, and without the bucket HKO proxy responses would not be cached offline.

Online, fresh data wins (stale-while-revalidate). Offline, the last successful response is replayed from CacheStorage. The cache does not survive a service worker update; the user must reopen the tab.

#### Fallback chain (per `fetchWeather` call)
| Outcome | Result | `fallbackSource` |
|---|---|---|
| Non-HK + OM ok | return OM (with `sources.om`) | — |
| Non-HK + OM fail | throw | — |
| HK + both ok | merged: `{...om, daily: merged, warnings, nearestStation, nearestDistrict}` (with `sources: { om, hko }`) | — |
| HK + OM ok, HKO error | `{...om, sources, hkoFailed: true}`; amber banner, faster TTL | `'partial'` |
| HK + OM fail, HKO ok (daily + current) | merged via `buildHKOWeatherData`; legacy HKO banner | `'HKO'` |
| HK + both fail → HKO-only fallback via `fetchHKOWeatherData` succeeds | HKO-only result with `sources.om.ok: false`, `sources.hko.ok: true` | `'HKO'` |
| HK + both fail → fallback also fails | error propagates to React Query (which uses the localStorage snapshot if available) | — |

#### Network timeouts
All timeouts defined in `src/lib/constants.ts` (`TIMING` object):
- Open-Meteo: **6s**
- HKO: **8s**
- Nominatim reverse geocode: **4s**
- Nowcast CSV: **10s**
- Default: **8s**

Timeouts throw → trigger React Query retry. No `Cache-Control` headers set or honored.

#### `localStorage` persistence
| Key | Purpose |
|---|---|
| `weather-default-city` | Last-selected city for cold-start seed |
| `weather-recent-cities` | Recent cities (max 3, MRU) for settings menu |
| `weather-language` | User language preference (`'en' \| 'tc'`) |
| `theme-mode` | User theme preference (`'light' \| 'dark' \| 'auto'`) |
| `weather-last-known-v1` | Schema-versioned envelope of the last successful weather fetch. Cold-start seed for instant first paint |

`weather-last-known-v1` is the new persistence layer. The app reads it synchronously on mount, clears it on city switch, and overwrites it on every successful `fetchWeather` call. The envelope's `cityId` (lat/lon rounded to 2 decimal places) prevents cross-city paint. A schema version mismatch or parse error causes a silent drop rather than a crash.

## Testing strategy
The project uses **Vitest** with jsdom. Coverage is split across layers (**260 tests**, 22 files):
- **Unit tests** (lib/):
  - `src/lib/weather.test.ts` (2): Open-Meteo client parsing, WMO weather-code mapping, recent-cities helpers.
  - `src/lib/hko-weather.test.ts` (47): PSR normalization/percentage/umbrella, PSR translation, station/district lookup, bounds checks, HKO icon mapping, warning display helpers.
  - `src/lib/weather-manager.test.ts` (14): all `fetchWeather` orchestration branches: HK/non-HK routing, parallel fetch + merge, HKO fallback, both-fail, progress callbacks, `lang` propagation.
  - `src/lib/devWarningSimulator.test.ts` (14): simulated warnings CRUD, baseline nonce bumping, dev-only environment isolation.
  - `src/lib/units.test.ts` (29), `src/lib/rainfallGrid.test.ts` (8), `src/lib/nowcastCache.test.ts` (20), `src/lib/weather/storage.test.ts` (12).
  - `src/lib/__fixtures__/`: live HKO `warnsum` response snapshots (EN + TC, captured 2026-07-31). Used by `WeatherAlerts.test.tsx` to lock the uppercase `CANCEL` regression against the real API shape.
- **Hook tests** (hooks/):
  - `src/hooks/useWarningChangeDetector.test.ts` (18): diff semantics, baseline reset on `resetKey`, case-insensitive `CANCEL` filtering, `Reissue` no-diff.
- **Context tests** (contexts/):
  - `src/contexts/LanguageContext.test.tsx` (12), `src/contexts/ThemeContext.test.tsx` (8), `src/contexts/UnitsContext.test.tsx` (6).
- **Component tests** (components/):
  - `src/components/CurrentWeather.test.tsx` (7): fixture-data render, umbrella indicator, sun event display.
  - `src/components/HourlyForecast.test.tsx` (7): empty forecast, chartData shape validation (mock capture), day/night `ReferenceArea` bands, sun-event `ReferenceLine` label capture, timezone propagation. Recharts is mocked because jsdom lacks ResizeObserver.
  - `src/components/RainfallMap.test.tsx` (7), `src/components/RainfallCellsLayer.test.tsx` (12): CSV fetch + bucket color assertions (RGBA stroke/fill), timeline-step transition (`fireEvent.click`), fetch error handling. `vi.stubGlobal('fetch')` with `vi.unstubAllGlobals()` in `beforeEach`.
  - `src/components/LocalClock.test.tsx` (6): wide-viewport renders HH:MM:SS with 1s interval; narrow-viewport (via `matchMedia` stub) drops seconds, uses 60s interval aligned to the next minute boundary.
  - `src/components/WeatherAlerts.test.tsx` (12): HKO warning rendering, modal open/close, warning detail display, cancellation filter (mixed-case + uppercase `CANCEL`), live-fixture replay of the 2026-07-31 cancelled amber rainstorm regression (EN + TC), TC/rainstorm signal icons, pulse animation.
  - `src/components/DailyForecast.test.tsx` (3), `src/components/WeatherBanners.test.tsx` (7), `src/components/SettingsMenu.test.tsx` (8).
- **Integration test**:
  - `src/test/Integration.test.tsx` (1): composes `CurrentWeather` + `HourlyForecast` with providers and fake timers; validates locale-agnostic time formatting (bounded `/09:00:00\s*PM/` pattern).

Test infra: `matchMedia` is stubbed in `src/test/setup.ts`; `vi.stubGlobal('matchMedia', ...)` is used in component tests that need viewport-specific branches (LocalClock narrow mode, etc.).

## Observability

Client-side only (static SPA; no server code). No third-party APM.

- **Vercel Analytics + Speed Insights.** `@vercel/analytics` (`<Analytics/>` in
  `main.tsx`) and `@vercel/speed-insights` (`<SpeedInsights/>` inside the router
  in `App.tsx`, fed the current route so per-route vitals are attributed
  correctly). First-party visitor counts + LCP/INP/CLS/TTFB in the Vercel
  dashboard, correlated with deploys.
- **SW lifecycle events.** `src/lib/sw-observability.ts` (`initSwObservability()`
  in `main.tsx`, before render) reports: `sw.unsupported`, `sw.registered`
  (sw.ready settled), `sw.register-error` (sw.ready rejected, or not settled
  within 30 s), `sw.update-available` (registration `updatefound`),
  `sw.controller-changed` (`controllerchange`; fires on first visit and on
  autoUpdate cutover). Dev → console via `logEvent`; prod → Vercel Analytics
  custom events via `track` (v2 API; v1 was `trackEvent`). The ready-watch is
  prod-only (no SW is registered in dev) and armed on `window.load`, when the
  injected `registerSW.js` calls `register()`. The injected script is
  fire-and-forget, so the 30 s timer is the only registration-failure signal.
- **Stuck-update detection.** High `sw.update-available` with low
  `sw.controller-changed` means autoUpdate is not applying to users.

## State management and styling
- **React Context API** handles user preferences with localStorage persistence (theme, language, units).
- **Tailwind CSS** drives the responsive layout: multi-column grids on desktop, vertical stacks on mobile, with a glass-morphism look. Staggered fade-ins and hover elevations keep the UI from feeling static.
