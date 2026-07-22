# Architecture

## Data Flow Diagram

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
│   • 'api-cache' — external hosts: api.open-meteo.com, geocoding-api.open-  │
│     meteo.com, data.weather.gov.hk, nominatim.openstreetmap.org           │
│   • 'hko-proxy-cache' — local origin /hko-data/* (dev Vite proxy +         │
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
1. **localStorage last-known snapshot** — schema-versioned envelope at `weather-last-known-v1`. Read synchronously at mount, used as React Query `initialData` with `initialDataUpdatedAt: 0` so the background fetch fires immediately. Cleared on city switch; overwritten on every successful fetch.
2. **React Query** — per-tab in-memory. Single source of truth at runtime. `staleTime` and `refetchInterval` collapse to 1 min when any source has failed. Hook augments cached-but-failed data with `fallbackSource: 'cache'`.
3. **Service Worker** — Workbox `NetworkFirst` for 5 host patterns across two cache buckets, 50 entries / 24h each. Survives tab close; not SW update.
4. **Browser cache** — HTTP-level `Cache-Control` (if any).
5. **localStorage user prefs** — language, theme, default city, recent cities.

## Overview
Weather Whisperer is a modern, responsive weather dashboard built with React and TypeScript. It leverages a dual-source architecture for data fetching, dynamically switching between the Hong Kong Observatory (HKO) API for granular local data (when in Hong Kong or the Pearl River Delta) and the Open-Meteo API for global coverage.

## Technology Stack
- **Framework**: React 18
- **Build Tool**: Vite 5
- **Language**: TypeScript 5
- **Data Fetching & Caching**: TanStack React Query 5 (sole owner of TTL, dedup, and refetch intervals — no app-level API cache layer)
- **Styling**: Tailwind CSS 3, custom CSS animations (`index.css`), `clsx` + `tailwind-merge`
- **UI Components**: shadcn-ui (Radix UI primitives)
- **Charts**: Recharts 2 (Hourly and Daily visualizations)
- **Map**: Leaflet 1.9 + react-leaflet 4 (HKO gridded rainfall nowcast)
- **Routing**: React Router 7
- **Date/Time Management**: `date-fns` 3
- **Icons**: Lucide React
- **PWA**: `vite-plugin-pwa` with `NetworkFirst` service worker routing for external APIs.

## Project Structure
- `src/components/`: Reusable React components
  - `ui/`: shadcn-ui primitives actually in use — `button`, `card`, `dialog`, `dropdown-menu`, `input`, `label`, `separator`, `sheet`, `skeleton`, `sonner`
  - `CurrentWeather.tsx`: Hero section displaying real-time conditions
  - `HourlyForecast.tsx`: Interactive 6-hour line chart (temperature & precipitation); day/night `ReferenceArea` bands and sun-event `ReferenceLine` markers when `daily` prop is provided
  - `DailyForecast.tsx`: 7-day forecast with min/max bounds
  - `RainfallMap.tsx`: Interactive Leaflet map visualizing HKO's gridded rainfall nowcast for HK + Pearl River Delta (Guangdong, China). Time-slider controls are rendered **above** the map so users see the active timestep before viewing the visualization. Data-driven viewport fit. Renders `GeoJSON` layers per color bucket via `polygonStyle()` (RGBA fill + stroke).
  - `SettingsMenu.tsx`: Global settings controls (Language, Theme, Location, manual refresh)
  - `WeatherAlerts.tsx`: HKO warning icons in the top bar; clicking opens modal with full alert details
- `src/contexts/`: Global application state
  - `LanguageContext.tsx`: Manages i18n between English and Traditional Chinese (HK)
  - `ThemeContext.tsx`: Manages active theme (Light, Dark, and Sun-synced Auto)
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
  - `weather-manager.ts`: Unified orchestrator — single entry point that merges Open-Meteo + HKO with parallel fetching, fault tolerance, and progress callbacks
  - `constants.ts`: `STORAGE_KEYS` and `TIMING` maps (centralized)
  - `fetch-utils.ts`: Shared `fetchWithTimeout`
  - `utils.ts`: Generic `cn()` and formatting helpers
  - `log.ts`: Conditional `console.*` logger (strips in production)
  - `devWarningSimulator.ts`: Dev-only simulated warnings store (useSyncExternalStore) — `devAddWarning`, `devRemoveWarning`, `devClearWarnings`, `devResetBaseline`; production returns empty arrays and zero nonce
- `src/pages/`: Application routing layers
  - `Index.tsx`: Main dashboard layout with grid/flex responsiveness
  - `NotFound.tsx`: 404 handler
- `src/test/`: Vitest setup
  - `setup.ts`: Global test setup (jest-dom matchers, mocks)
  - `Integration.test.tsx`: Cross-component integration coverage for `CurrentWeather` + `HourlyForecast`
- `src/contexts/` (tests):
  - `LanguageContext.test.tsx` — language toggle, localStorage persistence, translation lookup.
  - `ThemeContext.test.tsx` — light/dark/auto modes, sun-synced auto, localStorage persistence.
- `src/hooks/` (tests):
  - `useWarningChangeDetector.test.ts` — diff logic for added/removed warnings, baseline reset on key change, empty state handling.
- Entry points: `src/main.tsx` (root render) and `src/App.tsx` (providers, router, error boundary)

## Key Logic Concepts

### Unified Weather Gateway
The orchestrator at `src/lib/weather-manager.ts` is the single point of entry for all weather data. It manages:
- **Location Routing**: `isInHongKong(lat, lon)` toggles HKO enhancements. The rainfall map uses a broader `isInRainfallRegion(lat, lon)` check (Pearl River Delta) so Shenzhen/Guangzhou users also see nowcast data.
- **Hybrid Fetching**: Open-Meteo (primary, global) and HKO (secondary, HK-only) run in parallel via `Promise.all`.
- **Resilient Merging**: HKO daily entries are merged onto Open-Meteo's frame; Open-Meteo's sunrise/sunset takes precedence over HKO placeholders.
- **Fault Tolerance**: If HKO fails, Open-Meteo is returned with `hkoFailed: true` (banner shown in UI). If Open-Meteo fails and HKO succeeds, the gateway falls back to HKO-only data. If both fail, an error propagates to React Query.

### Caching & Retry Strategy

#### Three-Tier Cache (Read Top-Down on Cold Load)

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

#### React Query (In-Memory, Per-Tab)
Two `useQuery` consumers in `src/hooks/useWeatherWithProgress.ts` and `src/components/RainfallMap.tsx`. Global `QueryClient` default `retry: 1` set in `src/App.tsx`.

**Query 1 — `weather-unified`**
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

**Query key shape:** `[language, lat, lon]` — language + WGS-84 coordinate tuple. Geolocation jitter is mitigated upstream — `selectedCity` only swaps if `|Δlat| > 0.01 || |Δlon| > 0.01` (~1.1 km).

**Per-source TTL matrix** (TTLs are constants on `TIMING` in `src/lib/constants.ts`):

| Source | Field group | TTL | Rationale |
|---|---|---|---|
| OM | current / hourly | `STALE_TIME_MS` (5 min) | OM updates ~hourly; current is the volatile slice |
| OM | daily | `OM_FORECAST_TTL_MS` (30 min) | Daily forecast changes a few times per day |
| HKO | warnings / storm signal | `HKO_WARNINGS_TTL_MS` (1 min) | Push-driven, sub-minute user expectation |
| HKO | 9-day forecast | `HKO_FORECAST_TTL_MS` (30 min) | Matches HKO update cadence |
| Geocoding / Nominatim | reverse + search | `GEOCODING_TTL_MS` (7 d) | Place names are stable |
| Nowcast (RainfallMap) | gridded | `NOWCAST_REFETCH_INTERVAL_MS` (30 min) | HKO ~6 min generation cadence; 30 min is comfortable |

`hasFailure` is derived from `weather.sources` (`om.ok && hko.ok`) and
relaxes back to healthy cadence on next success.

**Query 2 — `hkoGriddedRainfallNowcast`**
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

#### Per-Source State

`WeatherData.sources` carries per-source freshness:

```ts
export type SourceState = {
  ok: boolean;          // did the most recent fetch attempt for this source succeed?
  cachedAt: number;     // epoch ms of last successful fetch for this source
  ttlMs: number;        // source-specific TTL
  isExpired: boolean;   // Date.now() - cachedAt > ttlMs
};
```

`ok: true` always implies `isExpired: false` (the orchestrator overwrites on success). On failure, `cachedAt` is 0 unless the hook backfills from the localStorage snapshot — that enhancement is intentionally not implemented in the orchestrator to keep its surface small.

**Known corner case (accepted).** The red offline banner in `WeatherBanners.tsx` shows a timestamp via `mostRecentCachedAt(weather)`, which returns the max of `om.cachedAt` and `hko.cachedAt` (filtering 0s). When the rendered payload comes from a `localStorage` snapshot whose previous fetch was itself a partial (e.g. OM ok / HKO failed at snapshot time), `snapshot.sources.hko.cachedAt = 0` and the banner falls back to OM's timestamp — the time of the last successful OM fetch, not the time the partial payload was assembled. This is mildly misleading ("cached from <OM fetch time>" when only OM was ever cached) but harmless: the red banner only renders when both APIs are down, and the working-source timestamp is at least an honest upper bound on staleness. Fixing this would require either the orchestrator backfilling from the snapshot (5-line change in `weather-manager.ts`) or storing a separate `snapshotAssembledAt` timestamp on the envelope.

`fallbackSource` values:
- `undefined` — both sources live
- `'HKO'` — OM unavailable, HKO-only fallback path produced the data (legacy banner)
- `'partial'` — one source live, the other failed (amber banner names the working one)
- `'cache'` — set by the hook, not the orchestrator, when `query.error && query.data`

#### Retry Mechanism
- Global default `retry: 1` in `src/App.tsx` → **2 total attempts** (1 initial + 1 retry) per error
- `retryDelay`: React Query v5 default `(attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)` → exponential backoff: 1s → 2s → 4s, capped at 30s
- RainfallMap explicitly sets `retry: 0` (nowcast has its own cadence; retrying immediately is wasteful)

Retries are **coarse-grained** — re-runs the entire `queryFn`, including all parallel fetches and fallback logic. No per-leg retry, no circuit breaker, no `retryOnError` predicate.

All non-2xx responses throw and are retried equally. Manual `refetch()` does not reset `failureCount` or `retryDelay`. On full failure the React Query retry kicks in; the localStorage snapshot keeps the UI populated so the user sees the red offline banner instead of an error message.

#### Service Worker (Persistent, Cross-Session)
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

The `/hko-data/*` bucket is critical for dev/prod parity: in dev the request is rewritten by the Vite proxy, and in prod by a Vercel rewrite — the browser-visible URL is the local origin in both cases, not `data.weather.gov.hk`. Without this second bucket, HKO proxy responses wouldn't be cached offline.

- **On network:** Fresh data wins (stale-while-revalidate)
- **On offline:** Last successful response is replayed from CacheStorage
- Does not survive service worker updates (user must reopen tab)

#### Fallback Chain (Per `fetchWeather` Invocation)
| Outcome | Result | `fallbackSource` |
|---|---|---|
| Non-HK + OM ok | return OM (with `sources.om`) | — |
| Non-HK + OM fail | throw | — |
| HK + both ok | merged: `{...om, daily: merged, warnings, nearestStation, nearestDistrict}` (with `sources: { om, hko }`) | — |
| HK + OM ok, HKO error | `{...om, sources, hkoFailed: true}` — amber banner, faster TTL | `'partial'` |
| HK + OM fail, HKO ok (daily + current) | merged via `buildHKOWeatherData`; legacy HKO banner | `'HKO'` |
| HK + both fail → HKO-only fallback via `fetchHKOWeatherData` succeeds | HKO-only result with `sources.om.ok: false`, `sources.hko.ok: true` | `'HKO'` |
| HK + both fail → fallback also fails | error propagates to React Query (which uses the localStorage snapshot if available) | — |

#### Network Timeouts
All timeouts defined in `src/lib/constants.ts` (`TIMING` object):
- Open-Meteo: **6s**
- HKO: **8s**
- Nominatim reverse geocode: **4s**
- Nowcast CSV: **10s**
- Default: **8s**

Timeouts throw → trigger React Query retry. No `Cache-Control` headers set or honored.

#### `localStorage` Persistence
| Key | Purpose |
|---|---|
| `weather-default-city` | Last-selected city for cold-start seed |
| `weather-recent-cities` | Recent cities (max 3, MRU) for settings menu |
| `weather-language` | User language preference (`'en' \| 'tc'`) |
| `theme-mode` | User theme preference (`'light' \| 'dark' \| 'auto'`) |
| `weather-last-known-v1` | Schema-versioned envelope of the last successful weather fetch — cold-start seed for instant first paint |

`weather-last-known-v1` is the new persistence layer. It is read synchronously on mount, cleared on city switch, and overwritten on every successful `fetchWeather` call. The envelope's `cityId` (rounded to 2 decimal places of lat/lon) prevents cross-city paint. Schema version mismatch or parse error causes a silent drop rather than a crash.

## Testing Strategy
The project uses **Vitest** with jsdom. Coverage is split across layers (**133 tests**, 12 files):
- **Unit tests**:
  - `src/lib/weather.test.ts` — Open-Meteo client parsing, WMO weather-code mapping, recent-cities helpers.
  - `src/lib/hko-weather.test.ts` — 47 tests covering PSR normalization/percentage/umbrella, PSR translation, station/district lookup, bounds checks, HKO icon mapping, and warning display helpers.
  - `src/lib/weather-manager.test.ts` — 13 tests covering all `fetchWeather` orchestration branches: HK/non-HK routing, parallel fetch + merge, HKO fallback, both-fail, progress callbacks, `lang` propagation.
  - `src/lib/devWarningSimulator.test.ts` — 12 tests covering simulated warnings CRUD, baseline nonce bumping, and dev-only environment isolation.
- **Component tests**:
  - `src/components/CurrentWeather.test.tsx` — render with fixture data, umbrella indicator, sun event display.
  - `src/components/HourlyForecast.test.tsx` — 6 tests: empty forecast, chartData shape validation (via mock capture), day/night `ReferenceArea` bands, sun-event `ReferenceLine` label capture, timezone propagation. Recharts is mocked because jsdom lacks ResizeObserver.
  - `src/components/RainfallMap.test.tsx` — 3 tests: CSV fetch + bucket color assertions (RGBA stroke/fill), timeline-step transition (`fireEvent.click`), fetch error handling. `vi.stubGlobal('fetch')` with `vi.unstubAllGlobals()` in `beforeEach`.
  - `src/components/WeatherAlerts.test.tsx` — 10 tests: HKO warning rendering, modal open/close, warning detail display, cancelled warning filtering, TC/rainstorm signal icons.
- **Integration test**:
  - `src/test/Integration.test.tsx` — composes `CurrentWeather` + `HourlyForecast` with providers and fake timers; validates locale-agnostic time formatting (bounded `/09:00:00\s*PM/` pattern).

## State Management & Styling
- **React Context API** handles user preferences with localStorage persistence (Theme + Language).
- **Tailwind CSS** drives responsive layouts (multi-column grids for desktop, vertical stacks for mobile) while adhering to a premium glass-morphism aesthetic. Micro-animations prevent static UIs (staggered fade-ins, hover elevations).
