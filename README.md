# Weather Forecast Application

A modern, responsive weather application built with React and TypeScript. Features real-time weather data from multiple sources including the Hong Kong Observatory (HKO) and Open-Meteo, with support for multiple languages, a gridded rainfall nowcast map, and a sleek glass-morphism design.

## Features

- **Dual Weather Sources**: Automatically switches between Hong Kong Observatory (HKO) and Open-Meteo based on location; Open-Meteo is primary, HKO enhances HK areas
- **Resilient Gateway**: Parallel fetching with per-source status badges; HKO failure degrades gracefully to Open-Meteo without blocking the UI
- **Fetching Status Screen**: Animated loading overlay with per-source status badges (Open-Meteo / HKO) during initial data fetch; `FetchingStatus` + `StatusBadge` components
- **Local Clock**: High-frequency (1s) time display extracted into a memoized component for referential stability of the parent card
- **Warning Change Detector**: Detects when HKO warnings are newly issued or cancelled between polls, with baseline reset on city switches
- **Consolidated Settings**: Manage location search, current location detection, theme, language, and manual data refresh from a single menu
- **Multi-Language Support**: English and Traditional Chinese interface
- **Location Services**: Auto-detect user location or search for any city worldwide with recent cities history (last 3)
- **Weather Data**: Current conditions, hourly forecasts (6 hours), and daily forecasts (7 days)
- **Local Timezone Display**: Shows date and time in the selected location's timezone
- **High/Low Temperatures**: Daily minimum and maximum temperatures displayed in the hero section
- **Sun Events**: Displays sunset or sunrise times based on current day/night status
- **Hourly Charts**: Interactive line charts showing temperature and precipitation probability with PSR (Probability of Significant Rain) labels
- **Gridded Rainfall Nowcast Map**: Interactive Leaflet map with timeline slider showing HKO gridded rainfall data for Hong Kong and the Pearl River Delta (including Guangdong, China)
- **Forecast Step Above Map**: Time-step play/pause controls and the formatted-time label sit directly above the map so the active window is visible before the user sees the visualization
- **User Location Marker**: Blue pin marker on the rainfall map showing the user's current position
- **Weather Alerts**: Real-time HKO warnings rendered as compact icons in the top bar; clicking opens a modal with full safety details
- **Data-Driven Map Zoom**: Rainfall map auto-fits viewport to actual data extent; default fallback is `PRD_BOUNDS` from `hko-weather.ts`
- **Per-Source Loading Indicators**: Live status badges for Open-Meteo and HKO fetch states (fetching / success / error)
- **Responsive Design**: Optimized for mobile, tablet, and desktop devices
- **Adaptive Cache Cadence**: React Query refetches every 5 minutes under normal conditions, drops to 1 minute during HKO failures so the app self-heals once HKO recovers
- **PWA**: Service worker uses a NetworkFirst policy so the last successful API response is replayed when offline

## Technology Stack

- **Frontend Framework**: React 18 with TypeScript 5
- **Build Tool**: Vite 5
- **UI Components**: shadcn-ui with Radix UI 1.x
- **Styling**: Tailwind CSS 3 with custom animations
- **Data Fetching**: TanStack React Query 5 (sole TTL owner — no separate cache layer)
- **Routing**: React Router 7
- **Map**: Leaflet 1.9 + react-leaflet 4
- **Icons**: Lucide React
- **Charts**: Recharts 2
- **Date Handling**: date-fns 3
- **PWA**: vite-plugin-pwa with workbox `NetworkFirst`
- **Testing**: Vitest 2 with Testing Library + jsdom (133 tests, 12 files)

## Project Structure

```
src/
├── components/         # Reusable UI components
│   ├── ui/            # shadcn-ui primitives in use: button, card, dialog,
│   │                 # dropdown-menu, input, label, separator, sheet, skeleton,
│   │                 # sonner
│   ├── CurrentWeather.tsx     # Hero section with conditions, temp range, umbrella
│   ├── HourlyForecast.tsx     # 6-hour line chart with day/night bands + sun markers
│   ├── DailyForecast.tsx      # 7-day forecast with min/max bounds
│   ├── RainfallMap.tsx        # Leaflet map + HKO gridded nowcast, GeoJSON layers
│   ├── FetchingStatus.tsx     # Per-source loading screen (Open-Meteo + HKO status badges)
│   ├── LocalClock.tsx         # Per-second local time display (extracted for perf)
│   ├── StatusBadge.tsx        # Pill-shaped status indicator (fetching/success/error/waiting)
│   ├── WeatherBanners.tsx     # Warning banners for fallback mode and HKO failures
│   ├── SettingsMenu.tsx       # Language, theme, location, manual refresh
│   └── WeatherAlerts.tsx      # HKO warning icons + modal
├── contexts/          # React Context providers
│   ├── LanguageContext.tsx
│   └── ThemeContext.tsx
├── hooks/             # Shared React hooks
│   ├── usePwaInstall.ts
│   ├── useOnlineStatus.ts    # online/offline boolean
│   ├── useSelectedCity.ts    # city init, geo-swap, persistence
│   ├── useWeatherWithProgress.ts  # useQuery wrapper with per-source loadProgress
│   └── useWarningChangeDetector.ts  # Detects HKO warning set changes between polls
├── lib/               # API clients, gateway, constants, helpers
│   ├── weather/               # Open-Meteo sub-modules
│   │   ├── open-meteo.ts     # API client + WMO code mapping
│   │   ├── geocoding.ts      # City search, reverse geocode, user location
│   │   ├── storage.ts        # Default/recent city persistence
│   │   ├── codes.ts          # WMO weather-code → description/icon
│   │   └── types.ts          # GeoLocation, WeatherData, etc.
│   ├── hko-types.ts           # HKO API response interfaces
│   ├── hko-bounds.ts          # HK_BOUNDS, PRD_BOUNDS, isInHongKong
│   ├── hko-stations.ts        # Station/district lookups + coordinates
│   ├── hko-translations.ts    # Station/district name translation (en↔tc)
│   ├── hko-psr.ts             # PSR ladder + normalize/psrToPercentage/umbrella
│   ├── hko-fetch.ts           # hkoFetch<T> base fetcher + data builders
│   ├── hko-icons.ts           # HKO icon → WMO code, warning colors/icons
│   ├── hko-weather.ts         # Barrel re-export
│   ├── devWarningSimulator.ts # Dev-only simulated warnings store (useSyncExternalStore)
│   ├── weather-manager.ts     # Unified gateway (parallel fetch, merge, fallback)
│   ├── constants.ts           # STORAGE_KEYS and TIMING maps
│   ├── fetch-utils.ts         # fetchWithTimeout
│   └── utils.ts               # cn(), formatting helpers
├── pages/             # Route components
│   ├── Index.tsx               # Main dashboard (297 LOC)
│   └── NotFound.tsx            # 404
├── test/              # Vitest setup + integration suite
│   ├── setup.ts
│   └── Integration.test.tsx
├── components/*.test.tsx        # Component unit tests (5 files, 24 tests)
├── lib/*.test.ts                # API/parsing unit tests (4 files, 84 tests)
├── contexts/*.test.tsx          # Context tests (2 files, 17 tests)
├── hooks/*.test.ts              # Hook tests (1 file, 17 tests)
├── App.tsx             # Providers, router, error boundary
└── main.tsx            # Application entry point
```

## Getting Started

### Prerequisites

- Node.js 18+ (Vite 5 requirement)
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

### Build & Preview

```bash
npm run build       # Production build
npm run build:dev   # Development build (no minification)
npm run preview     # Preview the production build
npm run lint        # ESLint
npm test            # Vitest (single run: add --run)
```

## API Sources

### Open-Meteo (primary)
- Free, open-source weather API
- Global coverage
- Provides current weather, hourly, and daily forecasts

### Hong Kong Observatory (HKO) (HK-only secondary)
- Official Hong Kong weather data (automatically activated for HK locations)
- Includes weather warnings and alerts
- Probability of Significant Rain (PSR) data
- Station-based observations
- Gridded rainfall nowcast (CSV, served via `/hko-data/...` proxy in `vite.config.ts` and `vercel.json`)

## Features Breakdown

### Current Weather
The hero section displays:
- **Location & Time**: Current city name and local time formatted for that timezone
- **Weather Icon**: Large weather icon indicating current conditions
- **Temperature**: Current apparent temperature with "feels like" label
- **Daily Range**: High and low temperatures for the day with visual indicators
- **Weather Condition**: Current precipitation and humidity data
- **Umbrella Indicator**: Shows whether an umbrella is recommended based on current rain or upcoming precipitation
- **Sun Events**: Displays the next sunset (during day) or sunrise (during night) with exact time

### Hourly Forecast
6-hour forecast with interactive line chart showing:
- Temperature trend (left Y-axis)
- Precipitation probability with PSR labels (right Y-axis)
- Hourly time slots

### Daily Forecast
7-day forecast with:
- Min/max temperatures
- Weather conditions
- Precipitation probability
- Weather icons

### Settings & Navigation
The consolidated hamburger menu provides access to:
- **Global City Search**: Autocomplete search for any location (Open-Meteo Geocoding API)
- **Recent Locations**: Quick access to the last 3 visited cities
- **Current Location**: One-tap detection of the user's current position
- **Theme Toggle**: Switch between Light, Dark, and Auto (sun-synced) modes
- **Language Toggle**: Switch between English and Traditional Chinese
- **Manual Data Refresh**: Force-clear local caches and fetch fresh weather data on-demand

### Weather Alerts
Real-time weather warnings rendered as compact icons in the top bar; clicking opens a modal with the full safety text. Coverage:
- Typhoon signals (TC1, TC3, TC8, TC8B-D, TC9, TC10)
- Rainstorm warnings (Red, Amber)
- Special weather advisories (Hot Weather, Cold Weather, Frost, etc.)
- Tsunami and landslip warnings
- 20 locally-hosted animated warning GIFs (no CDN dependencies)
- Cancelled warnings are filtered via `actionCode` + detail-text check

### Gridded Rainfall Nowcast
- HKO gridded rainfall data visualized on an interactive Leaflet map
- Covers Hong Kong and the Pearl River Delta (Shenzhen, Guangzhou, Macau, Zhuhai — extends into Guangdong, China)
- **Forecast step controls sit directly above the map**: Play/Pause button, the active `Forecast Step` label (formatted HH:MM), the timeline slider, and clickable per-step buttons. Layout is `flex-col` on mobile and `flex-row` on `md+` so the slider can stretch the full width.
- Map follows underneath with the active timestep's color-bucketed GeoJSON overlay
- Precise ending timestamps are derived from raw CSV `endTime` values
- User location blue pin marker with automatic map zoom to data extent
- Scroll wheel zoom, double-click zoom, and zoom controls
- Legend overlay bottom-right with seven color buckets from `< 0.5 mm` to `> 30 mm`

## Local Storage

The application persists only minimal city metadata to `localStorage`:
- `weather-default-city` — the last selected GeoLocation
- `weather-recent-cities` — up to 3 recent cities (capped)
- `weather-language` — user language preference (`'en' | 'tc'`)
- `theme-mode` — user theme preference (`'light' | 'dark' | 'system'`)

TTL caching is handled entirely by React Query's `staleTime` / `refetchInterval`.

All icon assets (Leaflet markers, 20 HKO warning GIFs) are locally hosted under `public/icons/` — no external CDN dependencies.

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers

## Performance

- Automatic data refetch every 5 minutes (falls back to 1 minute during HKO failures)
- Single-cache strategy: React Query handles TTL/dedup; PWA service worker handles offline replay
- Optimized animations with Tailwind CSS
- Lazy-loaded heavy modules (`HourlyForecast`, `RainfallMap` via `React.lazy` + `Suspense`)
- Production-optimized build with Vite
- Preconnect/dns-prefetch hints for external APIs and basemap tiles

## License

This project is built with Lovable and uses open-source libraries. Please refer to individual package licenses.

## Support

For issues and feature requests, please contact through the Lovable platform or your project repository.
