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
│   Key: 'weather-last-known-v2' (schema-versioned)                          │
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
1. **localStorage last-known snapshot.** Schema-versioned envelope at `weather-last-known-v2`. Read synchronously at mount, used as React Query `initialData` with `initialDataUpdatedAt: 0` so the background fetch fires immediately. Cleared on city switch; overwritten on every successful fetch.
2. **React Query persister.** Full QueryClient serialized to localStorage via `@tanstack/query-persist-client-core` (key: `weather-rq-cache-v1`, 512 KB cap). Kicks in on tab reload to avoid the post-reload FetchingStatus flash.
3. **React Query.** Per-tab in-memory, the single source of truth at runtime. `staleTime` and `refetchInterval` collapse to 1 min when any source has failed. The hook augments cached-but-failed data with `fallbackSource: 'cache'`.
4. **Service worker.** Workbox `NetworkFirst` for 5 host patterns across two cache buckets, 50 entries / 24h each. Survives tab close; not a service worker update.
5. **Browser cache.** HTTP-level `Cache-Control`, where the origin sends it.
6. **localStorage user prefs.** Language, theme, default city, recent cities.

## Overview
Weather Whisperer is a weather dashboard built with React and TypeScript. It uses two data sources: Open-Meteo for global coverage, and the Hong Kong Observatory (HKO) API for granular local data when the location is in Hong Kong or the Pearl River Delta.

## Technology stack
- **Framework**: React 18
- **Build Tool**: Vite 6
- **Language**: TypeScript 5
- **Data fetching and caching**: TanStack React Query 5 (sole owner of TTL, dedup, and refetch intervals; no app-level API cache layer)
- **Styling**: Tailwind CSS 3, custom CSS animations (`index.css`), `clsx` + `tailwind-merge`
- **UI Components**: shadcn-ui (Radix UI primitives)
- **Charts**: Recharts 2 (Hourly and Daily visualizations)
- **Map**: MapLibre GL JS (CARTO vector/raster basemap, HKO GeoJSON rainfall layer, MSC WMS raster layer)
- **Swiper**: Swiper 14 (horizontal carousels for forecast cards and quiet-shelf chips)
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
  - `ShareForecastButton.tsx`: share icon in the daily-forecast card header. Builds a chat-friendly message of the upcoming days (emoji condition, low–high, rain chance, app link) via `buildForecastShareText`, then hands it to the Web Share API so the user can pick the friends/chat to send it to; falls back to clipboard copy + toast when `navigator.share` is unavailable or fails (share-sheet dismissal is silent).
  - `AtAGlance.tsx`: at-a-glance strip between hero and daily forecast — one day group per day (today + tomorrow: low→high range, rain ≥20 %; wind intentionally omitted, it lives on the daily cards), sharing a line when they fit and wrapping per day when they don't. Two kinds of controls share the row: each day's temperature group is a button with a full-sentence `aria-label` whose activation calls `onReveal` (scroll to / advance to the daily forecast), and each rain chip is its own button calling `onRevealNowcast` (jump to the nowcast pane — deck slide 3 on mobile, section scroll on desktop; degrades to static text when the city is outside nowcast coverage). No chevron — the strip reads as two plain controls.
  - `RainStartBanner.tsx`: thin "when will it rain?" strip above the at-a-glance row (both layouts). Merges `WeatherData.minutely` (Open-Meteo, city-scale) with the HKO `RainGrid` when the rain map has populated the shared `['hkoGriddedRainfallNowcast']` cache — the 0–2 h segment then upgrades to district accuracy. Read-only query subscription (`enabled: false`) so the banner never triggers the 2.7 MB CSV fetch; minute-tick re-render keeps "in ~N min" phrasing current; renders nothing when no series is usable. Merge logic lives in `src/lib/rain-start.ts`.
  - `RainfallMap.tsx`: Chunk-split wrapper → `RainfallMapInner` (HKO gridded nowcast) via lazy loading. Shows "Load Map" prompt. Error boundary catches lazy-chunk load failures.
  - `RainfallMapInner.tsx`: HKO gridded nowcast (CSV parsed → GeoJSON, time-slider, timeline step buttons). Fetches CSV into `RainGrid`, converts client-side to GeoJSON using `[longitude, latitude]` coordinates. Query with `staleTime: NOWCAST_CACHE_TTL_MS`, `refetchInterval: NOWCAST_REFETCH_INTERVAL_MS (30 min)`, `retry: 1`.
  - `MSCRainfallMap.tsx`: Chunk-split wrapper → `MSCRainfallMapInner` (MSC GeoMet (Meteorological Service of Canada) rainfall WMS tile layer for Vancouver). Error boundary catches lazy-chunk load failures. Auto-loads when the section renders (no prompt).
  - `MSCRainfallMapInner.tsx`: MSC WMS tile rendering with batch error tracking, tile load hang guard (20s), and retry nonce. Shows stale-data indicator when tiles fail to load.
  - `MapLibreMap.tsx`: MapLibre basemap wrapper (CARTO vector/raster tiles). Handles user location marker.
  - `SettingsMenu.tsx`: Global settings controls (Units, Theme, Language, Text size, Location, manual refresh)
  - `OfflineIndicator.tsx`: Top-bar connectivity chip driven by `useOnlineStatus` — renders nothing while online; on `navigator.onLine` → offline shows an amber badge (`role="status"`, reuses the `data.offline` string) so users learn data may be stale before a fetch fails. On reconnect React Query's default `refetchOnReconnect` refreshes in the background. Direct (non-lazy) import: must be visible on a cold start that begins offline.
  - `WeatherAlerts.tsx`: HKO warning icons in the top bar; tapping opens a modal with the full safety text. Tap targets are **44×44 CSS px on mobile (WCAG 2.5.5 AAA)** with 28px icons, and 48×48 with 32px icons on `sm+`. Cancellation filter is case-insensitive on `actionCode` against `"CANCEL"`. HKO returns uppercase; a previous mixed-case compare silently let a cancelled amber rainstorm stay visible until 2026-07-31.
- `src/contexts/`: Global application state
  - `LanguageContext.tsx`: Manages i18n between English and Traditional Chinese (HK)
  - `ThemeContext.tsx`: Manages active theme (Light, Dark, and Sun-synced Auto)
  - `UnitsContext.tsx`: Manages unit preference (metric/US), persisted to localStorage
  - `FontSizeContext.tsx`: Manages UI text scale (Small 80% / Medium 100% / Large 125% root font-size), persisted to localStorage. Applied to `document.documentElement` so all rem-based Tailwind spacing/typography — the entire layout — rescales with it; `medium` removes the inline override.
- `src/hooks/`: React hooks
  - `useCitySearch.ts`: Open-Meteo Geocoding API autocomplete
  - `useOnlineStatus.ts`: Returns `true` while the browser reports offline (consumed by `OfflineIndicator`)
  - `usePwaInstall.ts`: Tracks `beforeinstallprompt` and provides an `install()` helper
  - `useSelectedCity.ts`: City init, geo-swap, persistence wrapper
  - `useWeatherWithProgress.ts`: `useQuery` wrapper with `loadProgress` per-source status, faster retry on failure
  - `useWarningChangeDetector.ts`: HKO warning set changes between polls (detects added/removed warnings)
- `src/lib/`: Core business logic and integrations
  - `weather.ts` (barrel): re-exports from sub-modules
  - `aria-utils.tsx`: Shared sr-only `aria-live` status region (`StatusRegionProvider` / `useStatusRegion`) for polite/assertive announcements
  - `weather/open-meteo.ts`: Open-Meteo API client + parameter assembly
  - `weather/geocoding.ts`: City search, reverse geocode, user location
  - `weather/storage.ts`: Default/recent city persistence helpers
  - `weather/codes.ts`: WMO weather-code to description/icon mapping
  - `weather/types.ts`: `GeoLocation`, `WeatherData`, `CurrentWeather`, `HourlyForecast`, `DailyForecast`, `MinutelyPrecipitation` interfaces
  - `hko-weather.ts` (barrel): re-exports from sub-modules
  - `hko-types.ts`: HKO API response interfaces (`HKOCurrentWeatherResponse`, `HKOForecastResponse`, `HKOWarning`, `HKOWarningSummaryResponse`)
  - `hko-bounds.ts`: `HK_BOUNDS`, `PRD_BOUNDS`, `isInHongKong`, `isInRainfallRegion`
  - `hko-stations.ts`: HKO stations + districts lookups (`findNearestStation`, `findNearestDistrict`, `get*Coordinates`)
  - `hko-translations.ts`: Station/district name translations (en ↔ tc)
  - `hko-psr.ts`: PSR ladder constant + `normalizePsr`, `psrToPercentage`, `psrNeedsUmbrella`
  - `hko-fetch.ts`: `hkoFetch<T>` base fetcher (8s timeout), plus data builders
  - `hko-icons.ts`: HKO icon → WMO code mapping, warning colors/icons
  - `weather-manager.ts`: Unified orchestrator and the single entry point; merges Open-Meteo + HKO with parallel fetching, fault tolerance, and progress callbacks
  - `constants.ts`: `STORAGE_KEYS` and `TIMING` maps (centralized), `QUIET` thresholds for quiet-shelf chips
  - `fetch-utils.ts`: Shared `fetchWithTimeout`
  - `utils.ts`: Generic `cn()` and formatting helpers
  - `log.ts`: Conditional `console.*` logger (strips in production)
  - `devWarningSimulator.ts`: Dev-only simulated warnings store on `useSyncExternalStore` (`devAddWarning`, `devRemoveWarning`, `devClearWarnings`, `devResetBaseline`). Production returns empty arrays and zero nonce.
  - `carto.ts`: Carto basemap URL helpers (`cartoStyleUrl`, `cartoRasterUrl`, `cartoMapLibreRasterUrl`), validates `VITE_CARTO_API_KEY`
  - `nowcastCache.ts`: Rainfall nowcast localStorage cache (15-min TTL, LZ-string compressed)
  - `parsers.ts`: Generic data parsing utilities
  - `msc-wms.ts`: MSC GeoMet WMS tile fetching (geo.weather.gc.ca)
  - `msc-prefetch.ts`: MSC data prefetching strategy (tiered by connection type)
  - `rainfallBands.ts`: Rainfall color band definitions
  - `rain-start.ts`: "When will it rain?" merge (see Key logic concepts). Normalizes HKO grid windows + Open-Meteo `minutely_15`/hourly into one verdict (`RainStartForecast`); pure and unit-tested.
  - `units.ts`: Unit conversion (`°C→°F`, `km/h→mph`, `mm→in`)
  - `share-forecast.ts`: Pure share-message builder for the daily forecast (see `ShareForecastButton`). Emojis come from `getWeatherIcon`, rain chance from `precipitationProbabilityMax` or the HKO PSR level via `psrToPercentage`, and dates render in the city's timezone per app language. Takes a `translate` callback so it stays framework-free.
  - `queryPersistence.ts`: React Query localStorage persistence via `@tanstack/query-persist-client-core` (512 KB cap, schema-versioned)
  - `sw-observability.ts`: Service worker metrics
- `src/pages/`: Application routing layers
  - `Index.tsx`: Main dashboard layout with grid/flex responsiveness
  - `NotFound.tsx`: 404 handler
- `src/test/`: Vitest setup
  - `setup.ts`: Global test setup (jest-dom matchers, mocks, `vi.stubGlobal` for matchMedia)
  - `Integration.test.tsx`: Cross-component integration coverage for `CurrentWeather` + `HourlyForecast`
- Entry points: `src/main.tsx` (root render) and `src/App.tsx` (providers, router, error boundary)

## Key logic concepts

### Unified weather gateway
The orchestrator at `src/lib/weather-manager.ts` is the single point of entry for all weather data. It manages:
- **Location routing.** `isInHongKong(lat, lon)` toggles HKO enhancements. The rainfall map uses a broader `isInRainfallRegion(lat, lon)` check (Pearl River Delta) so Shenzhen and Guangzhou users also see nowcast data.
- **Hybrid fetching.** Open-Meteo (primary, global) and HKO (secondary, HK-only) run in parallel via `Promise.all`.
- **Merging.** HKO daily entries merge onto Open-Meteo's frame; Open-Meteo's sunrise/sunset takes precedence over HKO placeholders.
- **Fault tolerance.** If HKO fails, Open-Meteo is returned with `hkoFailed: true` (banner shown in UI). If Open-Meteo fails and HKO succeeds, the gateway falls back to HKO-only data. If both fail, the error propagates to React Query.

### Rain-start verdict (`src/lib/rain-start.ts`)
The banner answers "when will it rain?" by merging three series into one timeline. All series are normalized to explicit rain windows `{ startMs, endMs, mm }` because their native semantics differ:
- **HKO gridded nowcast** (0–2 h, ~1 km cells): step ending at `T` covers `(T−30 min, T]`. Sampled at the selected location via `sampleRainGridAt` (nearest cell). Only present when the rain map has populated the query cache — the CSV stays opt-in.
- **Open-Meteo `minutely_15`** (`WeatherData.minutely`, fetched in the unified call): value at `T` is the preceding-15-minute sum → `(T−15 min, T]`.
- **Open-Meteo hourly** (fallback when minutely is missing): value at `T` is the preceding-hour sum → covers `(T−60 min, T]` (Open-Meteo aggregates precipitation backwards for both hourly and `minutely_15`).

Merge rules: dedupe by window start with the nowcast winning shared slots (both grids sit on whole-minute UTC boundaries since HKT is a whole-hour offset), drop closed windows, verdict from the first window ≥ `RAIN_THRESHOLD_MM` (0.1 mm). Status is `raining-now` (window straddling now is wet, `endsAt` when a dry window follows), `rain-expected` (startsAt/startsInMinutes), or `no-rain` (within `horizonMinutes`).

**Precision tiering.** `source: 'hko-grid'` segments are district-accurate; Open-Meteo snaps requests to ~7–8 km model grid cells (verified 2026-09-17: Kwun Tong and Central return the identical cell), so Open-Meteo-backed copy carries a "city-wide" qualifier instead of implying district precision.

### Caching and retry strategy

#### Multi-tier cache (read top-down on cold load)

1. **localStorage last-known snapshot** (`weather-last-known-v2`).
   Schema-versioned envelope: `{ v, cityId, lang, fetchedAt, data }`. Read
   synchronously at mount; used as React Query `initialData` with
   `initialDataUpdatedAt: 0` so the background fetch fires immediately.
   Cleared on city switch; overwritten on every successful fetch.

2. **React Query persister** (`weather-rq-cache-v1`). Serializes the full
   QueryClient to localStorage via `@tanstack/query-persist-client-core`.
   Guarded by `MAX_BYTES` (512 KB) to avoid quota overflows. Schema version
   (`PERSIST_SCHEMA_VERSION = 'v1'`) is compared against a `buster` field on
   restore; mismatch drops the cache. App.tsx passes the persister to
   `QueryClientProvider`'s `defaultOptions.queries.persist`.

3. **React Query** (in-memory, per-tab). Single source of truth at runtime.
   Per-source `sources: { om, hko }` field on every return drives the UI's
   banner tone (none / amber / red).

4. **Service worker** (Workbox Cache Storage API, cross-session). Two
   `NetworkFirst` buckets, both 50 entries / 24h.

The hook augments cached-but-failed data with `fallbackSource: 'cache'`
when `query.error && query.data`, so the red offline banner can render
without the orchestrator having to handle that path itself.

#### React Query (in-memory, per-tab)
Two `useQuery` consumers in `src/hooks/useWeatherWithProgress.ts` and `src/components/RainfallMapInner.tsx`. Global `QueryClient` default `retry: 1` set in `src/App.tsx`.

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

**Query 2: `hkoGriddedRainfallNowcast`** (in `RainfallMapInner.tsx`)
```ts
useQuery({
  queryKey: ['hkoGriddedRainfallNowcast'],
  queryFn: fetchRainfallNowcast,
  staleTime: TIMING.NOWCAST_CACHE_TTL_MS,
  refetchInterval: (query) => {
    // Schedule next refetch for when cache TTL expires
    // Anchored on dataUpdatedAt for precision
    const ttl = TIMING.NOWCAST_REFETCH_INTERVAL_MS;
    const lastUpdate = query.state.dataUpdatedAt || 0;
    return Math.max(ttl - (Date.now() - lastUpdate), 0);
  },
  retry: 1,
  retryDelay: 1000,
});
```
Single global key. Uses a dynamic `refetchInterval` anchored on `dataUpdatedAt` so stale-time and refetch cadence stay in sync. `NOWCAST_REFETCH_INTERVAL_MS` is 30 minutes (HKO ~6 min generation cadence).

**Query 3: city search** (in `useCitySearch.ts`)
```ts
useQuery({
  queryKey: ['citySearch', input],
  queryFn: () => openMeteoGeocoding(input),
  enabled: input.length >= 2,
  staleTime: 5 * 60_000,
  retry: 0,
});
```
Directly wraps the Open-Meteo Geocoding API. Debounced by the component at 300ms to limit requests.

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
- RainfallMapInner sets `retry: 1` (one automatic retry on transient failure). After retry failure the query settles into error state and the UI shows the stale-data indicator or a full-screen error overlay with manual refetch button.

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
| `weather-last-known-v2` | Schema-versioned envelope of the last successful weather fetch. Cold-start seed for instant first paint |

`weather-last-known-v2` is the new persistence layer. The app reads it synchronously on mount, clears it on city switch, and overwrites it on every successful `fetchWeather` call. The envelope's `cityId` (lat/lon rounded to 2 decimal places) prevents cross-city paint. A schema version mismatch or parse error causes a silent drop rather than a crash.

## Testing strategy
The project uses **Vitest** with jsdom. Coverage is split across layers (**450 tests**, 34 files):
- **Unit tests** (lib/):
  - `src/lib/weather.test.ts` (2): Open-Meteo client parsing, WMO weather-code mapping, recent-cities helpers.
  - `src/lib/weather/hko-codes.test.ts` (15): WMO weather-code descriptions and icons.
  - `src/lib/hko-weather.test.ts` (47): PSR normalization/percentage/umbrella, PSR translation, station/district lookup, bounds checks, HKO icon mapping, warning display helpers.
  - `src/lib/weather-manager.test.ts` (21): all `fetchWeather` orchestration branches: HK/non-HK routing, parallel fetch + merge, HKO fallback, both-fail, progress callbacks, `lang` propagation.
  - `src/lib/devWarningSimulator.test.ts` (14): simulated warnings CRUD, baseline nonce bumping, dev-only environment isolation.
  - `src/lib/units.test.ts` (29), `src/lib/parsers.test.ts` (23), `src/lib/share-forecast.test.ts` (4), `src/lib/rain-start.test.ts` (15): share-message header/day-line/link shape and °F conversion; window normalization for the Open-Meteo `minutely_15`/hourly and HKO-grid series (both preceding-sum), merge dedupe with the grid preferred on shared slots, verdict branches (rain expected, raining-now with/without end, trace amounts treated as dry), source attribution, horizon and series capping. `src/lib/rainfallGrid.test.ts` (14), `src/lib/rainfallGeoJson.test.ts` (1), `src/lib/nowcastCache.test.ts` (20), `src/lib/msc-wms.test.ts` (21), `src/lib/msc-prefetch.test.ts` (16), `src/lib/sw-observability.test.ts` (13), `src/lib/carto.test.ts` (3), `src/lib/weather/storage.test.ts` (13).
  - `src/lib/__fixtures__/`: live HKO `warnsum` response snapshots (EN + TC, captured 2026-07-31). Used by `WeatherAlerts.test.tsx` to lock the uppercase `CANCEL` regression against the real API shape.
- **Hook tests** (hooks/):
  - `src/hooks/useWarningChangeDetector.test.ts` (18): diff semantics, baseline reset on `resetKey`, case-insensitive `CANCEL` filtering, `Reissue` no-diff.
- **Context tests** (contexts/):
  - `src/contexts/LanguageContext.test.tsx` (12), `src/contexts/ThemeContext.test.tsx` (8), `src/contexts/UnitsContext.test.tsx` (6), `src/contexts/FontSizeContext.test.tsx` (7).
- **Component tests** (components/):
  - `src/components/CurrentWeather.test.tsx` (36): fixture-data render, umbrella indicator, unit conversions, HKO headline icon states, quiet-shelf behavior, today L/H + 3-hour trend caption, daylight/night sun strip.
  - `src/components/HourlyForecast.test.tsx` (8): empty forecast, chartData shape validation (mock capture), day/night `ReferenceArea` bands, sun-event `ReferenceLine` label capture, timezone propagation. Recharts is mocked because jsdom lacks ResizeObserver.
  - `src/components/DailyForecast.test.tsx` (4): Swiper carousel rendering, forecast cards, precipitation probability.
  - `src/components/LocalClock.test.tsx` (6): wide-viewport renders HH:MM:SS with 1s interval; narrow-viewport (via `matchMedia` stub) drops seconds, uses 60s interval aligned to the next minute boundary.
  - `src/components/AtAGlance.test.tsx` (13): empty/sentinel-day rendering, per-day temperature-button sentences in metric and US units, rain-chip button vs static-text fallback (nowcast reachable or not), rain-chance 20 % cutoff (visible text and aria-labels), no-chevron regression, Traditional Chinese labels, `onReveal` / `onRevealNowcast` activation.
  - `src/components/RainStartBanner.test.tsx` (4): rain-expected / raining-now / no-rain verdict copy, city-wide qualifier, live-region content stable across minute ticks (countdown clause excluded), renders nothing when no series is usable.
  - `src/components/OfflineIndicator.test.tsx` (5): hidden while online, badge appears on `offline` event / offline-at-mount, hides on `online` event, Traditional Chinese string.
  - `src/components/WeatherAlerts.test.tsx` (12): HKO warning rendering, modal open/close, warning detail display, cancellation filter (mixed-case + uppercase `CANCEL`), live-fixture replay of the 2026-07-31 cancelled amber rainstorm regression (EN + TC), TC/rainstorm signal icons, pulse animation.
  - `src/components/WeatherBanners.test.tsx` (8), `src/components/SettingsMenu.test.tsx` (23).
  - `src/pages/NotFound.test.tsx` (6): 404 page rendering, programmatic focus on h1.
- **Integration test**:
  - `src/test/Integration.test.tsx` (1): composes `CurrentWeather` + `HourlyForecast` with providers and fake timers; validates locale-agnostic time formatting (bounded `/09:00:00\s*PM/` pattern).

Test infra: `matchMedia` stubbed globally in `src/test/setup.ts` via `vi.stubGlobal`. Component tests that need viewport-specific branches (LocalClock narrow mode) use `vi.stubGlobal('matchMedia', ...)`; globals are un-stubbed in `beforeEach`. Fetch mocking: `vi.stubGlobal('fetch')` with `vi.unstubAllGlobals()` in setup for tests that need custom fetch responses.

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
