# Architecture

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
- **PWA**: `vite-plugin-pwa` with custom `NetworkFirst` routing for external APIs.

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

### Progressive Fetch (Refetch Cadence)
- `staleTime` and `refetchInterval` are coupled: 5 minutes under normal conditions, dropped to 1 minute while `weather.hkoFailed || weather.isFallback` is true.
- Per-source status (`idle | fetching | success | error`) is reported through `loadProgress` and rendered as live badges during the first fetch.

## Testing Strategy
The project uses **Vitest** with jsdom. Coverage is split across layers (**85 tests**, 8 files):
- **Unit tests**:
  - `src/lib/weather.test.ts` — Open-Meteo client parsing, WMO weather-code mapping, recent-cities helpers.
  - `src/lib/hko-weather.test.ts` — 47 tests covering PSR normalization/percentage/umbrella, PSR translation, station/district lookup, bounds checks, HKO icon mapping, and warning display helpers. Two bugs found here: `'Med High'` missing from `RAW_TO_LEVEL` and `LEVEL_TO_VALUE` in `hko-psr.ts`.
  - `src/lib/weather-manager.test.ts` — 13 tests covering all `fetchWeather` orchestration branches: HK/non-HK routing, parallel fetch + merge, HKO fallback, both-fail, progress callbacks, `lang` propagation. One bug found here: `fetchHKOWeatherData` referenced but not imported in `weather-manager.ts`.
- **Component tests**:
  - `src/components/CurrentWeather.test.tsx` — render with fixture data, umbrella indicator, sun event display.
  - `src/components/HourlyForecast.test.tsx` — 6 tests: empty forecast, chartData shape validation (via mock capture), day/night `ReferenceArea` bands, sun-event `ReferenceLine` label capture, timezone propagation. Recharts is mocked because jsdom lacks ResizeObserver.
  - `src/components/RainfallMap.test.tsx` — 3 tests: CSV fetch + bucket color assertions (RGBA stroke/fill), timeline-step transition (`fireEvent.click`), fetch error handling. `vi.stubGlobal('fetch')` with `vi.unstubAllGlobals()` in `beforeEach`.
- **Integration test**:
  - `src/test/Integration.test.tsx` — composes `CurrentWeather` + `HourlyForecast` with providers and fake timers; validates locale-agnostic time formatting (bounded `/09:00:00\s*PM/` pattern).

## Resilient Offline Capabilities (PWA)
Progressive Web App support relies on a single layer — **service worker caching** — combined with React Query for API timeouts:
1. **Service Worker**: `vite.config.ts` registers a `NetworkFirst` workbox handler for external API routes (Open-Meteo, HKO, Nominatim) with a 1-day cache ceiling. When the network is reachable, fresh data wins; on offline, the last successful response is replayed.
2. **TTL / Refetch**: React Query's `refetchInterval` shortens to 1 minute when `hkoFailed` is detected, so the app self-heals once HKO recovers.
3. **City Persistence**: `localStorage` stores only the `weather-default-city` and `weather-recent-cities` keys. There is no app-level API payload fallback — manual refresh is exposed via the settings menu, which calls `cache.clearWeather()` before invalidating React Query.

## State Management & Styling
- **React Context API** handles user preferences with localStorage persistence (Theme + Language).
- **Tailwind CSS** drives responsive layouts (multi-column grids for desktop, vertical stacks for mobile) while adhering to a premium glass-morphism aesthetic. Micro-animations prevent static UIs (staggered fade-ins, hover elevations).
