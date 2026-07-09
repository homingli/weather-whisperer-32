# Architecture

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER LOCATION                                   │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    weather-manager.ts (orchestrator)                         │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  isInHongKong(lat, lon)                                             │   │
│   │  ├─ false → Open-Meteo only                                         │   │
│   │  └─ true  → Promise.all([Open-Meteo, HKO]) → merge                 │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
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
│   ┌──────────────────┐  ┌──────────────────────────────────────────────┐   │
│   │  Cache (RAM)    │  │  Retry: exponential backoff (1s→2s→4s→30s)   │   │
│   │  staleTime: 5min │  │  retry: 3 attempts per failure               │   │
│   │  (1min if HKO↓)  │  │                                              │   │
│   └──────────────────┘  └──────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Service Worker (cross-session)                         │
│                                                                             │
│   NetworkFirst: api.open-meteo.com, data.weather.gov.hk, nominatim.osm      │
│   Cache: 50 entries, 1-day TTL                                            │
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
│   ┌──────────────┐  ┌──────────────┐                                      │
│   │  RainfallMap │  │  SettingsMenu│                                      │
│   │  (separate   │  │  (language,  │                                      │
│   │   query)     │  │   theme,     │                                      │
│   └──────────────┘  │   city)      │                                      │
│                     └──────────────┘                                      │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        localStorage (user prefs only)                         │
│                                                                             │
│   weather-language  ·  theme-mode  ·  weather-default-city  ·  weather-recent-cities
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key caching layers (innermost → outermost):**
1. **React Query** — 5min TTL, per-tab in-memory. Falls to 1min when HKO fails.
2. **Service Worker** — NetworkFirst fallback, survives tab close.
3. **Browser cache** — HTTP-level `Cache-Control` (if any).
4. **localStorage** — user preferences only; no weather payload stored.

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
- `src/pages/`: Application routing layers
  - `Index.tsx`: Main dashboard layout with grid/flex responsiveness
  - `NotFound.tsx`: 404 handler
- `src/test/`: Vitest setup
  - `setup.ts`: Global test setup (jest-dom matchers, mocks)
  - `Integration.test.tsx`: Cross-component integration coverage for `CurrentWeather` + `HourlyForecast`
- Entry points: `src/main.tsx` (root render) and `src/App.tsx` (providers, router, error boundary)

## Key Logic Concepts

### Unified Weather Gateway
The orchestrator at `src/lib/weather-manager.ts` is the single point of entry for all weather data. It manages:
- **Location Routing**: `isInHongKong(lat, lon)` toggles HKO enhancements. The rainfall map uses a broader `isInRainfallRegion(lat, lon)` check (Pearl River Delta) so Shenzhen/Guangzhou users also see nowcast data.
- **Hybrid Fetching**: Open-Meteo (primary, global) and HKO (secondary, HK-only) run in parallel via `Promise.all`.
- **Resilient Merging**: HKO daily entries are merged onto Open-Meteo's frame; Open-Meteo's sunrise/sunset takes precedence over HKO placeholders.
- **Fault Tolerance**: If HKO fails, Open-Meteo is returned with `hkoFailed: true` (banner shown in UI). If Open-Meteo fails and HKO succeeds, the gateway falls back to HKO-only data. If both fail, an error propagates to React Query.

### Caching & Retry Strategy

#### React Query (In-Memory, Per-Tab)
Two `useQuery` consumers in `src/hooks/useWeatherWithProgress.ts` and `src/components/RainfallMap.tsx`. No global options on `QueryClient`; relies on defaults.

**Query 1 — `weather-unified`**
```ts
useQuery({
  queryKey: ['weather-unified', language, latitude, longitude],
  queryFn: () => fetchWeather(lat, lon, lang, onProgress),
  enabled: latitude !== undefined && longitude !== undefined,
  refetchInterval: hasFailure ? TIMING.REFETCH_ON_FAILURE_MS : TIMING.REFETCH_INTERVAL_MS,
  staleTime: hasFailure ? TIMING.REFETCH_ON_FAILURE_MS : TIMING.STALE_TIME_MS,
  placeholderData: 'keepPreviousData',
});
```

**Query key shape:** `[language, lat, lon]` — language + WGS-84 coordinate tuple. Geolocation jitter is mitigated upstream — `selectedCity` only swaps if `|Δlat| > 0.01 || |Δlon| > 0.01` (~1.1 km).

**TTL / staleness matrix:**

| Condition | `staleTime` | `refetchInterval` |
|---|---|---|
| Healthy (no flags) | 5 min | 5 min |
| `weather.hkoFailed \|\| weather.isFallback` | 1 min | 1 min |

`hasFailure` is stored in React state (derived from last successful response), so cadence relaxes back to 5 min on success.

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

#### Retry Mechanism
No custom retry config. Both queries rely on React Query v5 defaults:
- `retry: 3` → up to **4 total attempts** (1 initial + 3 retries) per error
- `retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)` → **exponential backoff: 1s → 2s → 4s**, capped at 30s

Retries are **coarse-grained** — re-runs the entire `queryFn`, including all parallel fetches and fallback logic. No per-leg retry, no circuit breaker, no `retryOnError` predicate.

All non-2xx responses throw and are retried equally. Manual `refetch()` does not reset `failureCount` or `retryDelay`.

#### Service Worker (Persistent, Cross-Session)
Configured in `vite.config.ts` via `vite-plugin-pwa` with Workbox `NetworkFirst` handler:

```ts
urlPattern: /^https:\/\/(api\.open-meteo\.com|geocoding-api\.open-meteo\.com|data\.weather\.gov\.hk|nominatim\.openstreetmap\.org)\/.*/i,
handler: 'NetworkFirst',
options: {
  cacheName: 'api-cache',
  expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 }, // 1 day
  cacheableResponse: { statuses: [0, 200] }
}
```

- **On network:** Fresh data wins (stale-while-revalidate)
- **On offline:** Last successful response is replayed from CacheStorage
- Does not survive service worker updates (user must reopen tab)

#### Fallback Chain (Per `fetchWeather` Invocation)
| Outcome | Result |
|---|---|
| Non-HK + OM ok | return OM |
| Non-HK + OM fail | throw |
| HK + both ok | merged: `{...om, daily: merged, warnings, nearestStation, nearestDistrict}` |
| HK + OM ok, HKO error | `{...om, hkoFailed: true}` — banner, shorter TTL |
| HK + OM fail, HKO ok | second stage: `getHKOCurrentWeather` + `buildHKOWeatherData` |
| HK + both fail | final HKO-only retry via `fetchHKOWeatherData`; if that also throws → error propagates to React Query |

#### Network Timeouts
All timeouts defined in `src/lib/constants.ts` (`TIMING` object):
- Open-Meteo: **6s**
- HKO: **8s**
- Nominatim reverse geocode: **4s**
- Default: **8s**

Timeouts throw → trigger React Query retry. No `Cache-Control` headers set or honored.

#### `localStorage` Persistence
| Key | Purpose |
|---|---|
| `weather-default-city` | Last-selected city for cold-start seed |
| `weather-recent-cities` | Recent cities (max 3, MRU) for settings menu |
| `weather-language` | User language preference (`'en' \| 'tc'`) |
| `theme-mode` | User theme preference (`'light' \| 'dark' \| 'system'`) |

No weather payload is ever written to `localStorage`.

## Testing Strategy
The project uses **Vitest** with jsdom. Coverage is split across layers (**85 tests**, 8 files):
- **Unit tests**:
  - `src/lib/weather.test.ts` — Open-Meteo client parsing, WMO weather-code mapping, recent-cities helpers.
  - `src/lib/hko-weather.test.ts` — 47 tests covering PSR normalization/percentage/umbrella, PSR translation, station/district lookup, bounds checks, HKO icon mapping, and warning display helpers.
  - `src/lib/weather-manager.test.ts` — 13 tests covering all `fetchWeather` orchestration branches: HK/non-HK routing, parallel fetch + merge, HKO fallback, both-fail, progress callbacks, `lang` propagation.
- **Component tests**:
  - `src/components/CurrentWeather.test.tsx` — render with fixture data, umbrella indicator, sun event display.
  - `src/components/HourlyForecast.test.tsx` — 6 tests: empty forecast, chartData shape validation (via mock capture), day/night `ReferenceArea` bands, sun-event `ReferenceLine` label capture, timezone propagation. Recharts is mocked because jsdom lacks ResizeObserver.
  - `src/components/RainfallMap.test.tsx` — 3 tests: CSV fetch + bucket color assertions (RGBA stroke/fill), timeline-step transition (`fireEvent.click`), fetch error handling. `vi.stubGlobal('fetch')` with `vi.unstubAllGlobals()` in `beforeEach`.
- **Integration test**:
  - `src/test/Integration.test.tsx` — composes `CurrentWeather` + `HourlyForecast` with providers and fake timers; validates locale-agnostic time formatting (bounded `/09:00:00\s*PM/` pattern).

## State Management & Styling
- **React Context API** handles user preferences with localStorage persistence (Theme + Language).
- **Tailwind CSS** drives responsive layouts (multi-column grids for desktop, vertical stacks for mobile) while adhering to a premium glass-morphism aesthetic. Micro-animations prevent static UIs (staggered fade-ins, hover elevations).
