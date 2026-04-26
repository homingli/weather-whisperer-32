# Work Summary

**Timestamp:** 2026-04-26 09:16:00
**Commit Hash:** N/A (Local architecture doc & PWA offline enhancements)

## Changes Implemented

1.  **Architecture Documentation**: Created `ARCHITECTURE.md` detailing the project structure, tech stack, and the dual-source (HKO + Open-Meteo) fetching mechanisms.
2.  **PWA Offline Resilience**: Implemented a localized offline fallback caching layer. Altered `getWeather` and HKO fetch functions in `lib/weather.ts` and `lib/hko-weather.ts` to cache raw JSON responses directly to `localStorage` upon success, preventing offline UI crashes when the service worker cache is unavailable.
3.  **PWA Install Logic Refinement**: Modified the install button in `Index.tsx` to automatically hide completely after installation finishes (`!isInstalled`).
4.  **Vite PWA Config Expansion**: Expanded the runtime caching `urlPattern` regex in `vite.config.ts` to intercept `api.open-meteo.com`, `geocoding-api.open-meteo.com`, `data.weather.gov.hk`, and `nominatim.openstreetmap.org` for `NetworkFirst` handling.
5.  **Offline State UI**: Added active network state listeners (`navigator.onLine`) in `Index.tsx` to conditionally render the "Fresh data from..." indicators and intelligently prefer cached data rendering over failure error states.

---

**Timestamp:** 2026-04-26 10:30:00
**Commit Hash:** N/A (Local PWA fixes)

## Changes Implemented

1.  **PWA Plugin Version Fix**: Updated `vite-plugin-pwa` from `^4.7.0` (non-existent) to `^1.2.0` in `package.json` to resolve npm install errors during deployment.
2.  **PWA Metadata**: Added `theme-color`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, and `apple-mobile-web-app-title` meta tags to `index.html`.
3.  **PWA Links**: Added `<link rel="apple-touch-icon">` and `<link rel="manifest">` to `index.html` for iOS and Android PWA support.
4.  **Note**: PWA icons are configured but not present at `/icons/icon-192x192.png` and `/icons/icon-512x512.png` - these need to be added to `public/icons/` for full PWA functionality.
5.  **PWA Routing Fix**: Added `public/_redirects` for Cloudflare Pages SPA routing (serving static PWA files directly, falling back to index.html for other routes).
6.  **Vercel PWA Support**: Added `vercel.json` with rewrites to serve PWA files directly while routing SPA to index.html.
7.  **PWA Install Button**: Added `usePwaInstall` hook and install button beside settings menu at the top (only shows when PWA is installable).
8.  **Data Freshness**: Modified `lastFetchLabel` to show only when using cached/stale data (not during initial fetch).

---

**Timestamp:** 2026-04-17 09:55:00
**Commit Hash:** N/A (Local refactoring)

## Changes Implemented

1.  **Rendering Optimization**: Applied `useMemo` and `useCallback` hooks in `CurrentWeather.tsx`, `Index.tsx`, and `WeatherAlerts.tsx` to optimize component re-renders triggered by the 1-second clock tile.
2.  **API Security & Error Handling**: Wrapped all network requests and JSON parsing in `weather.ts` and `hko-weather.ts` with `try-catch` blocks to prevent unhandled promise rejections and UI crashes.
3.  **OSM API Policy Fix**: Added `User-Agent` headers to `reverseGeocode` requests to satisfy OpenStreetMap Nominatim's usage policy and resolve potential 403 Forbidden errors.
4.  **Robust Time Formatting**: Implemented fallbacks for `Intl.DateTimeFormat` to ensure the UI remains functional even with invalid timezone configurations.
5.  **Code Annotations**: Added concise one-liner comments to explain complex logic blocks in the hero section.

---

**Timestamp:** 2026-04-15 12:00:00 (approx)
**Commit Hash:** ece75a35d62bed4c623df3b4f4faec05220930e5

## Changes Implemented

1.  **Label Font Size**: Increased font size for 'umbrella', 'humidity', 'wind', and 'uv index' span labels from `9px` to `text-sm` in `src/components/CurrentWeather.tsx`.
2.  **PSR Labels**: Shortened "Medium" to "Med" and "Medium Low" to "Med Low" in the 7-day forecast. Updated `src/lib/hko-weather.ts` logic to map these shortened strings and replaced them in the HKO data source for the dashboard.
3.  **Glow Removal**:
    *   Removed `weather-icon-glow` class and its definition in `src/index.css`.
    *   Removed `animate-pulse-glow` from `src/pages/Index.tsx`.
    *   Cleaned up `pulse-glow` keyframes and animation in `tailwind.config.ts`.
