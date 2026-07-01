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
  - `RainfallMap.tsx`: Interactive Leaflet map visualizing HKO's gridded rainfall nowcast for HK + Pearl River Delta (Guangdong, China). Data-driven viewport fit
  - `SettingsMenu.tsx`: Global settings controls (Language, Theme, Location)
  - `CitySearch.tsx`: Autocomplete geocoding search
  - `WeatherAlerts.tsx`: HKO warning icons in top bar; clicking opens modal with full alert details
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

### Unified Weather Gateway
The orchestrator at `src/lib/weather-manager.ts` acts as a single point of entry for all weather data. It manages:
- **Location Routing**: Uses `isInHongKong(lat, lon)` to determine if HKO enhancements should be applied. Rainfall map uses `isInRainfallRegion(lat, lon)` (broader Pearl River Delta check) so Shenzhen/Guangzhou users also see nowcast data.
- **Hybrid Fetching**: Fetches global data from Open-Meteo and localized enhancements from HKO in parallel.
- **Resilient Merging**: Merges sources while ensuring critical data (like Open-Meteo's more accurate sunrise/sunset times) takes precedence over HKO's placeholders.
- **Fault Tolerance**: If HKO (secondary source) fails or times out, the gateway automatically falls back to Open-Meteo (primary source) to ensure the UI stays populated.

## Testing Strategy
The project uses **Vitest** for unit and integration testing:
- **Unit Tests**: Coverage for HKO date parsing, PSR-to-percentage mapping, and WMO weather code translations.
- **Integration Tests**: `weather-manager.test.ts` validates the end-to-end flow from coordinate input to combined weather output, including cache interaction and fallback behaviors.
- **Warning Validation**: Specific test cases in `hko-weather.test.ts` ensure that the HKO Warning API's various signal codes (Tropical Cyclones, Rainstorms, etc.) are correctly mapped and include their detailed safety messages.

## Resilient Offline Capabilities (PWA)
Progressive Web App support relies on dual-layer caching to ensure instant startup when disconnected:
1. **Service Worker Layer**: `vite.config.ts` forces a `NetworkFirst` policy for external API requests (Open-Meteo, HKO).
2. **App-Level Fallback Layer**: Core `fetch` requests save their raw JSON to `localStorage`. If `fetch` violently fails (offline with no active SW cache), the app immediately falls back to `JSON.parse` on `localStorage`, allowing React Query to render stale but successful payloads instantly.

## State Management & Styling
- **React Context API** handles user preferences with persistence (Theme/Language bounds).
- **Tailwind CSS** drives responsive layouts (multi-column grids for desktop, vertical stacks for mobile) while adhering to a premium glass-morphism aesthetic. Micro-animations prevent static UIs (staggered fade-ins, hover elevations).
