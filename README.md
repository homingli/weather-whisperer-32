# Weather Whisperer

A weather app built with React and TypeScript. It pulls data from the Hong Kong Observatory (HKO) and Open-Meteo, supports English and Traditional Chinese, and renders interactive rainfall nowcast maps with a glass-morphism design.

## Features

- **Dual weather sources.** Switches between Hong Kong Observatory (HKO) and Open-Meteo based on location. Open-Meteo is primary; HKO enhances coverage in Hong Kong.
- **Resilient gateway.** Parallel fetches with per-source status badges. An HKO failure falls back to Open-Meteo without blocking the UI.
- **Fetching status screen.** Animated loading overlay with per-source status badges (`FetchingStatus` + `StatusBadge` components).
- **Two languages.** English and Traditional Chinese with `<html lang>` synced synchronously on language switch.
- **Location services.** Auto-detect the user's position or search any city worldwide; the last 3 cities stay in a recent-cities list.
- **Weather data.** Current conditions, 6-hour forecasts, 7-day forecasts.
- **Local timezone.** Date and time in the selected location's timezone.
- **High/low temperatures.** Today's high and low in the hero caption, with a 3-hour trend indicator (up/down/flat).
- **Sun-cycle strip.** Day/night progress bar in the hero; next sunset during the day, next sunrise at night, with exact times.
- **UV index chip.** Color-banded UV chip with localized band labels (Low / Moderate / High / Very High / Extreme).
- **Tomorrow at a glance.** Thin strip between the hero and the daily forecast summarising tomorrow's range, rain chance (only when ≥ 20 %), and max wind; tapping reveals the full daily forecast.
- **Hourly charts.** Interactive temperature line with translucent precipitation-probability bars behind it (bars use their own right Y-axis).
- **7-day forecast cards.** Horizontal Swiper carousel with min/max temps, weather icons, and precipitation probability.
- **Gridded rainfall nowcast map.** Interactive MapLibre map with Carto basemap and HKO gridded rainfall for Hong Kong and the Pearl River Delta.
- **MSC rainfall tile layer.** Macau Meteorological Services WMS tiles rendered via the `MSCRainfallMap` component.
- **Carto basemap.** Optional vector basemap via Carto API key (`VITE_CARTO_API_KEY`); falls back to unauthenticated tiles.
- **User location marker.** Blue pin on the rainfall map for the user's position.
- **Weather alerts.** HKO warnings as compact icons in the top bar; clicking opens a modal with the full safety text.
- **Per-source loading indicators.** Status badges for Open-Meteo and HKO fetch state (fetching / success / error).
- **Responsive layout.** Works on mobile, tablet, and desktop.
- **Adaptive refetch cadence.** React Query refetches every 5 minutes, dropping to 1 minute when any source has failed.
- **Three-tier offline support.** `localStorage` last-known snapshot (lz-string compressed) seeds the first paint; React Query handles in-memory freshness; the Workbox service worker replays the last successful API response when fully offline. Amber banners mark partial data (one source missing); red banners mark cached data only, with a refetch button.
- **PWA.** The service worker uses per-host cache handlers (NetworkFirst / StaleWhileRevalidate / CacheFirst buckets) so dev and prod offline behavior match.
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
- **PWA**: vite-plugin-pwa with workbox
- **Testing**: Vitest 3 with Testing Library + jsdom

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

The application will open at `http://localhost:8080` (set in `vite.config.ts`) with hot module replacement enabled.

### Build and preview

```bash
npm run build       # Production build
npm run build:dev   # Development build (no minification)
npm run preview     # Preview the production build
npm run lint        # ESLint
npm test            # Vitest (single run: add --run)
```

### Responsive viewport audit

`npm run audit:viewports` walks the app at every iPhone logical portrait
width (375 → 440 CSS px) and asserts no page-level horizontal overflow, no
vertical page scroll, no clipped hero numerals, and no overlapping
interactive controls, capturing screenshots for review. All API/map data is
stubbed from recorded fixtures so runs are deterministic and offline.
Requires the dev-only `playwright-core` browser once per machine
(`pnpm exec playwright-core install chromium`). See `scripts/audit/README.md`.

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

## Browser support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers

## Documentation

- [Architecture](./ARCHITECTURE.md) — data flow, project structure, key logic concepts, testing strategy
- [Feature details](./docs/features.md) — per-feature breakdown (hero, hourly/daily, alerts, nowcast maps)
- [Local storage and caching](./docs/local-storage.md) — localStorage keys and the three-tier cache design
- [Performance](./docs/performance.md) — refetch cadence, lazy loading, render isolation
- [Accessibility](./docs/accessibility.md) — WCAG 2.1 AA status and remaining work
