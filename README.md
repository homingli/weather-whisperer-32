# Weather Whisperer

A weather app built with React and TypeScript. It pulls data from the Hong Kong Observatory (HKO) and Open-Meteo, supports English and Traditional Chinese, and renders interactive rainfall nowcast maps with a glass-morphism design.

## Features

- **Dual weather sources.** Switches between Hong Kong Observatory (HKO) and Open-Meteo based on location. Open-Meteo is primary; HKO enhances coverage in Hong Kong.
- **Resilient gateway.** Parallel fetches with per-source status badges. An HKO failure falls back to Open-Meteo without blocking the UI.
- **Fetching status screen.** Animated loading overlay with per-source status badges (`FetchingStatus` + `StatusBadge` components).
- **Two languages. English and Traditional Chinese with `<html lang>` synced synchronously on language switch.
- **Location services.** Auto-detect the user's position or search any city worldwide; the last 3 cities stay in a recent-cities list.
- **Weather data.** Current conditions, 6-hour forecasts, 7-day forecasts.
- **Local timezone.** Date and time in the selected location's timezone.
- **High/low temperatures.** Daily min and max in the hero section.
- **Sun events.** Next sunset during the day, next sunrise at night.
- **Hourly charts.** Interactive line charts for temperature and precipitation probability, with PSR (Probability of Significant Rain) labels.
- **7-day forecast cards.** Horizontal Swiper carousel with min/max temps, weather icons, and precipitation probability.
- **Gridded rainfall nowcast map.** Interactive MapLibre map with MapLibre basemap and HKO gridded rainfall for Hong Kong and the Pearl River Delta.
- **MSC rainfall tile layer.** Macau Meteorological Services WMS tiles rendered via the `MSCRainfallMap` component.
- **Carto basemap.** Optional vector basemap via Carto API key (`VITE_CARTO_API_KEY`); falls back to unauthenticated tiles.
- **User location marker.** Blue pin on the rainfall map for the user's position.
- **Weather alerts.** HKO warnings as compact icons in the top bar; clicking opens a modal with the full safety text.
- **Per-source loading indicators.** Status badges for Open-Meteo and HKO fetch state (fetching / success / error).
- **Responsive layout.** Works on mobile, tablet, and desktop.
- **Adaptive refetch cadence.** React Query refetches every 5 minutes, dropping to 1 minute when any source has failed.
- **Three-tier offline support.** `localStorage` last-known snapshot (lz-string compressed) seeds the first paint; React Query handles in-memory freshness; the Workbox service worker replays the last successful API response when fully offline. Amber banners mark partial data (one source missing); red banners mark cached data only, with a refetch button.
- **PWA.** The service worker uses NetworkFirst with two cache buckets (`api-cache` for direct API hosts, `hko-proxy-cache` for the dev Vite proxy / prod Vercel rewrite), so dev and prod offline behavior match.
- **Accessibility (WCAG 2.1 AA).** Skip link, sr-only data tables for the hourly/daily charts, `<html lang>` synced to the active UI language, semantic severity color tokens (≥5.5:1 on cream), `role="alert"` on the offline and partial-data banners, `aria-current` on the rainfall nowcast timestep buttons, `aria-label`s on icon-only controls.

## Technology stack

- **Frontend Framework**: React 18 with TypeScript
- **Build Tool**: Vite 6
- **UI Components**: shadcn-ui with Radix UI 2
- **Styling**: Tailwind CSS 3 with custom animations
- **Data Fetching**: TanStack React Query 5 (with persistence via `@tanstack/query-persist-client-core`)
- **Routing**: React Router 7
- **Map**: MapLibre GL JS 5
- **Swiper**: Swiper 14 (horizontal carousels for forecast cards and metric chips)
- **Icons**: Lucide React
- **Charts**: Recharts 2
- **Date Handling**: date-fns 3
- **PWA**: vite-plugin-pwa with workbox `NetworkFirst`
- **Testing**: Vitest 3 with Testing Library + jsdom

## Project structure

```
src/
├── components/         # Reusable UI components
│   ├── ui/            # shadcn-ui primitives: button, card, dialog,
│   │                 # dropdown-menu, input, label, separator, skeleton,
│   │                 # sonner
│   ├── CurrentWeather.tsx     # Hero section: conditions, temp range, umbrella
│   ├── HourlyForecast.tsx     # 6-hour line chart with day/night bands + sun markers
│   ├── DailyForecast.tsx      # 7-day forecast in Swiper carousel
│   ├── RainfallMap.tsx        # Thin wrapper → delegates to MSCRainfallMap
│   ├── MSCRainfallMap.tsx     # MSC (Macau) rainfall WMS tile layer
│   ├── RainfallMapInner.tsx   # HKO gridded nowcast (GeoJSON + timeline slider)
│   ├── MapLibreMap.tsx        # MapLibre basemap wrapper (Carto tiles)
│   ├── FetchingStatus.tsx     # Per-source loading screen
│   ├── LocalClock.tsx         # Adaptive-interval clock (1s / 60s)
│   ├── StatusBadge.tsx        # Pill-shaped status indicator
│   ├── WeatherBanners.tsx     # Offline / partial-data banners
│   ├── SettingsMenu.tsx       # Language, theme, location, refresh
│   └── WeatherAlerts.tsx      # HKO warning icons + modal
├── contexts/          # React Context providers
│   ├── LanguageContext.tsx    # en / zh-Hant-HK, synced to <html lang>
│   ├── ThemeContext.tsx       # light / dark / auto
│   └── UnitsContext.tsx       # metric (°C) / us (°F)
├── hooks/             # Shared React hooks
│   ├── useCitySearch.ts       # Open-Meteo Geocoding autocomplete
│   ├── useOnlineStatus.ts     # online/offline boolean
│   ├── usePwaInstall.ts
│   ├── useSelectedCity.ts     # city init, geo-swap, persistence
│   ├── useWeatherWithProgress.ts  # useQuery wrapper with per-source loadProgress
│   └── useWarningChangeDetector.ts  # HKO warning set changes between polls
├── lib/               # API clients, gateway, constants, helpers
│   ├── weather/               # Open-Meteo sub-modules
│   │   ├── open-meteo.ts     # API client + WMO code mapping
│   │   ├── geocoding.ts      # City search, reverse geocode, user location
│   │   ├── storage.ts        # Default/recent city persistence
│   │   ├── codes.ts          # WMO weather-code → description/icon
│   │   └── types.ts          # GeoLocation, WeatherData, etc.
│   ├── hko-types.ts           # HKO API response interfaces
│   ├── hko-bounds.ts          # HK_BOUNDS, PRD_BOUNDS
│   ├── hko-stations.ts        # Station/district lookups + coordinates
│   ├── hko-translations.ts    # Station/district name translation (en↔tc)
│   ├── hko-psr.ts             # PSR ladder + umbrella recommendation
│   ├── hko-fetch.ts           # hkoFetch<T> base fetcher
│   ├── hko-icons.ts           # HKO icon → WMO code, warning colors
│   ├── hko-weather.ts         # Barrel re-export
│   ├── msc-wms.ts             # MSC WMS tile fetching
│   ├── msc-prefetch.ts        # MSC data prefetching
│   ├── rainfallGrid.ts        # HKO gridded rainfall CSV parsing
│   ├── rainfallGeoJson.ts     # GeoJSON generation for map layers
│   ├── rainfallBands.ts       # Color band definitions
│   ├── carto.ts               # Carto basemap API key validation
│   ├── nowcastCache.ts        # Rainfall nowcast cache layer
│   ├── devWarningSimulator.ts # Dev-only simulated warnings (useSyncExternalStore)
│   ├── weather-manager.ts     # Unified gateway (parallel fetch, merge, fallback)
│   ├── queryPersistence.ts    # React Query localStorage persistence
│   ├── units.ts               # Unit conversion (°C→°F, km/h→mph, mm→in)
│   ├── constants.ts           # STORAGE_KEYS, QUIET thresholds, TIMING
│   ├── fetch-utils.ts         # fetchWithTimeout
│   ├── parsers.ts             # Generic data parsing utilities
│   ├── log.ts                 # Diagnostic logging abstraction
│   ├── sw-observability.ts    # Service worker metrics
│   └── utils.ts               # cn(), formatting helpers
├── pages/             # Route components
│   ├── Index.tsx               # Main dashboard
│   └── NotFound.tsx            # 404
├── test/              # Vitest setup + integration suite
│   ├── setup.ts
│   └── Integration.test.tsx
├── lib/__fixtures__/          # Live HKO warnsum snapshots for regression tests
├── components/*.test.tsx        # Component unit tests
├── lib/*.test.ts                # API/parsing unit tests
├── contexts/*.test.tsx          # Context tests
├── hooks/*.test.ts              # Hook tests
├── pages/*.test.tsx             # Page tests
├── App.tsx             # Providers, router, error boundary
└── main.tsx            # Application entry point
```

## Getting started

### Prerequisites

- Node.js 20+
- npm or pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/homingli/weather-whisperer-32.git

# Navigate to project directory
cd weather-whisperer-32

# Install dependencies
npm install
```

> Note: Lifecycle scripts are intentionally not run during install in this repo (`--ignore-scripts`); approve or run them explicitly only when you trust the dependency.

### Development

```bash
npm run dev
```

The application will open at `http://localhost:5173` (Vite default; check terminal output if it differs) with hot module replacement enabled.

### Build and preview

```bash
npm run build       # Production build
npm run build:dev   # Development build (no minification)
npm run preview     # Preview the production build
npm run lint        # ESLint
npm test            # Vitest (single run: add --run)
```

## API sources

### Carto basemap

Set `VITE_CARTO_API_KEY` in the deployment environment to authenticate Carto
vector basemap requests. The app logs a console warning when the variable is
missing and falls back to unauthenticated OSM tiles.

### Open-Meteo (primary)
- Free, open-source weather API
- Global coverage
- Provides current weather, hourly, and daily forecasts

### HKO (HK-only secondary)
- Official Hong Kong weather data (automatically activated for HK locations)
- Includes weather warnings and alerts
- Probability of Significant Rain (PSR) data
- Station-based observations
- Gridded rainfall nowcast (CSV, served via `/hko-data/...` proxy in `vite.config.ts` and `vercel.json`)

## Features breakdown

### Current weather
The hero section displays:
- **Location and time.** City name and local time formatted for that timezone
- **Icon.** Large weather icon for current conditions
- **Temperature.** Current apparent temperature with a "feels like" label
- **Daily range.** High and low temperatures for the day with visual indicators
- **Condition.** Current precipitation and humidity data
- **Umbrella indicator.** Whether an umbrella is recommended, based on current rain or upcoming precipitation
- **Sun events.** Next sunset during the day, next sunrise at night, with exact time

### Hourly forecast
6-hour forecast with an interactive line chart:
- Temperature trend (left Y-axis)
- Precipitation probability with PSR labels (right Y-axis)
- Hourly time slots

### Daily forecast
7-day forecast with:
- Min/max temperatures
- Weather conditions
- Precipitation probability
- Weather icons

### Settings and navigation
The hamburger menu covers:
- **Global city search.** Autocomplete over the Open-Meteo Geocoding API
- **Recent locations.** The last 3 visited cities
- **Current location.** One-tap geolocation
- **Theme toggle.** Light, dark, and auto (sun-synced) modes
- **Language toggle.** English and Traditional Chinese
- **Manual refresh.** Fetches fresh data on demand; falls back to the last cached snapshot if the source is unreachable

### Weather alerts
HKO warnings render as compact icons in the top bar; clicking opens a modal with the full safety text. Coverage:
- Typhoon signals (TC1, TC3, TC8, TC8B-D, TC9, TC10)
- Rainstorm warnings (Red, Amber)
- Special weather advisories (Hot Weather, Cold Weather, Frost, etc.)
- Tsunami and landslip warnings
- 20 locally-hosted animated warning GIFs (no CDN dependencies)
- Cancelled warnings are filtered with `actionCode.toUpperCase() !== 'CANCEL'` (case-insensitive; HKO returns uppercase `CANCEL`). The filter is locked against the live fixture in `src/lib/__fixtures__/`

### Gridded rainfall nowcast
- HKO gridded rainfall data visualized on an interactive MapLibre map
- Covers Hong Kong and the Pearl River Delta (Shenzhen, Guangzhou, Macau, Zhuhai; extends into Guangdong, China)
- Forecast step controls sit directly above the map: Play/Pause button, the active `Forecast Step` label (formatted HH:MM), the timeline slider, and clickable per-step buttons.
- Map follows underneath with the active timestep's color-bucketed GeoJSON overlay
- MSC (Macau) rainfall tile layer via WMS, rendered through `MSCRainfallMap`
- Carto basemap support for vector tiles when `VITE_CARTO_API_KEY` is set
- Precise ending timestamps are derived from raw CSV `endTime` values
- User location blue pin marker with automatic map zoom to data extent
- Scroll wheel zoom, double-click zoom, and zoom controls
- Legend overlay bottom-right with seven color buckets from `< 0.5 mm` to `> 30 mm`

## Local storage

The application persists the following to `localStorage`:
- `weather-default-city`: the last selected GeoLocation
- `weather-recent-cities`: up to 3 recent cities (capped, MRU)
- `weather-language`: user language preference (`'en' | 'tc'`)
- `theme-mode`: user theme preference (`'light' | 'dark' | 'auto'`)
- `weather-last-known-v1`: schema-versioned, lz-string compressed envelope of the last successful weather fetch. Read synchronously at mount as the cold-start seed; cleared on city switch; overwritten on every successful fetch.
- `weather-units`: preferred unit system, `'metric'` (default: °C / km/h / mm) or `'us'` (°F / mph / in). Read at `UnitsContext` mount, written on toggle.

Cache strategy is a three-tier design:

1. **`localStorage` last-known snapshot.** Synchronous read at mount, lz-string compressed, cleared on city switch
2. **React Query.** Per-tab in-memory, the single source of truth at runtime. Per-source TTLs (OM 5min current, OM 30min daily, HKO 1min warnings, geocoding 7d) collapse to 1 min when any source has failed. Persistence via `@tanstack/query-sync-storage-persister` bridges page reloads.
3. **Workbox service worker.** Cross-session `NetworkFirst` cache, 50 entries / 24h per bucket, replayed when fully offline

All icon assets (map marker, 20 HKO warning GIFs) are locally hosted under `public/icons/`. No external CDN dependencies.

## Browser support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers

## Performance

- Automatic data refetch every 5 minutes (falls back to 1 minute when any source has failed)
- Three-tier cache: `localStorage` last-known snapshot for cold-start paint, React Query for in-memory freshness with per-source TTLs, Workbox for cross-session offline replay
- Custom CSS animations in `index.css`, layered on Tailwind utilities
- Lazy-loaded heavy modules (`HourlyForecast`, `RainfallMap` via `React.lazy` + `Suspense`)
- Minified production build via Vite
- Preconnect/dns-prefetch hints for external APIs and basemap tiles
- Shared `Intl.DateTimeFormat` cache (`src/lib/utils.ts`) avoids per-render formatter construction
- `LocalClock` isolates the per-tick re-render so the rest of the current-weather card stays referentially stable. The tick interval adapts to the displayed precision: 1s while seconds are visible on `sm+`, 60s when dropped below `sm`; it re-binds on viewport changes via `matchMedia`
- All diagnostic logging no-ops in production builds (gated on `import.meta.env.PROD`)

## Accessibility

Conformance target is WCAG 2.1 Level AA. Accessibility work is tracked with the implementation and test suite in `src/`.

What's in place today:

- **Document language.** `<html lang>` is synced to `zh-Hant-HK` / `en` synchronously inside the `LanguageProvider` initializer, so screen readers never see a flash of English on a Chinese-filled page
- **Skip link.** "Skip to main content" link is the first focusable element
- **Landmarks.** `<main id="main-content">`, `<nav aria-label>`, `<footer aria-label>`, plus an `sr-only <h1>Weather Forecast</h1>`
- **Live regions.** `role="alert"` on the offline / partial-data banners; `role="status" aria-live="polite"` on the refresh indicator
- **Forms.** the city search input has an `aria-label`; the search dialog uses a Radix `Dialog` with `sr-only DialogTitle`
- **Charts.** each Recharts SVG has an `aria-label` and an accompanying `sr-only <table>` exposing the same data points to screen readers
- **Color contrast.** semantic severity tokens (`--severity-warning-fg`, `--severity-success-fg`, `--severity-error-fg`, `--severity-info-fg`) at ≥5.5:1 on cream, and a deeper `--muted-foreground` (28% light / 52% dark) so `/50`, `/60`, `/70` subdivisions clear 4.5:1
- **Keyboard.** visible `focus-visible:ring-2` ring on every interactive element; explicit `aria-current` on RainfallMap time-step buttons; `<h1>` in `NotFound.tsx` programmatically focuses on mount
- **Quiet shelf.** Below-threshold metric chips (precip, humidity, UV, wind) use `aria-label` to carry full values; tap/toggle reveals detail on focus (WCAG 1.4.13)

Remaining work: non-color cues inside visualization widgets, `prefers-reduced-motion` guards on all animations, and Playwright + `@axe-core` e2e coverage.


