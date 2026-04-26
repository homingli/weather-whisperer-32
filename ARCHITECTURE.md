# Architecture

## Overview
Weather Whisperer is a modern, responsive weather dashboard built with React and TypeScript. It leverages a dual-source architecture for data fetching, dynamically switching between the Hong Kong Observatory (HKO) API for granular local data (when in Hong Kong) and the Open-Meteo API for global coverage.

## Technology Stack
- **Framework**: React 18
- **Build Tool**: Vite 5
- **Language**: TypeScript 5
- **Data Fetching & Caching**: TanStack React Query 5
- **Styling**: Tailwind CSS 3, custom CSS animations (`index.css`), `clsx` + `tailwind-merge`
- **UI Components**: shadcn-ui (Radix UI primitives)
- **Charts**: Recharts 2 (Hourly and Daily visualizations)
- **Routing**: React Router 7
- **Date/Time Management**: `date-fns` 3
- **Icons**: Lucide React
- **PWA & Offline**: `vite-plugin-pwa` with custom `NetworkFirst` routing and a secondary `localStorage` JSON cache fallback for API payloads.

## Project Structure
- `src/components/`: Reusable React components
  - `ui/`: Baseline shadcn-ui components (e.g., buttons, dialogs, sliders)
  - `CurrentWeather.tsx`: Hero section displaying real-time conditions
  - `HourlyForecast.tsx`: Interactive 6-hour line chart (temperature & precipitation)
  - `DailyForecast.tsx`: 7-day forecast with min/max bounds
  - `SettingsMenu.tsx`: Global settings controls (Language, Theme, Location)
  - `CitySearch.tsx`: Autocomplete geocoding search
  - `WeatherAlerts.tsx`: Active warnings widget, customized for HKO alerts
- `src/contexts/`: Global application state
  - `LanguageContext.tsx`: Manages i18n between English and Traditional Chinese (HK)
  - `ThemeContext.tsx`: Manages active theme (Light, Dark, and Sun-synced Auto)
- `src/lib/`: Core business logic and integrations
  - `weather.ts`: Open-Meteo API client, reverse geocoding, and offline cache fallbacks
  - `hko-weather.ts`: Hong Kong Observatory API client with local warning parsing
  - `utils.ts`: Helper functions
- `src/pages/`: Application routing layers
  - `Index.tsx`: Main dashboard layout with grid/flex responsiveness
  - `NotFound.tsx`: 404 Error handler
- `src/hooks/`: React hooks
  - `usePwaInstall.ts`: Pwa installation lifecycle tracking

## Key Logic Concepts

### Dual Source Data Fetching
React Query manages robust data fetching. The logic checks if coordinates fall within Hong Kong boundaries:
- **Inside HK**: `src/lib/hko-weather.ts` provides local features (PSR, HKO localized warnings, district tracking).
- **Outside HK**: `src/lib/weather.ts` supplies global data via Open-Meteo.
Both sources' outputs are fused and normalized before passing to UI components.

### Resilient Offline Capabilities (PWA)
Progressive Web App support relies on dual-layer caching to ensure instant startup when disconnected:
1. **Service Worker Layer**: `vite.config.ts` forces a `NetworkFirst` policy for external API requests (Open-Meteo, HKO).
2. **App-Level Fallback Layer**: Core `fetch` requests save their raw JSON to `localStorage`. If `fetch` violently fails (offline with no active SW cache), the app immediately falls back to `JSON.parse` on `localStorage`, allowing React Query to render stale but successful payloads instantly.

### State Management & Styling
- **React Context API** handles user preferences with persistence (Theme/Language bounds).
- **Tailwind CSS** drives responsive layouts (multi-column grids for desktop, vertical stacks for mobile) while adhering to a premium glass-morphism aesthetic. Micro-animations prevent static UIs (staggered fade-ins, hover elevations).
