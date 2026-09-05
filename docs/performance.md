# Performance

- Automatic data refetch every 5 minutes (falls back to 1 minute when any source has failed)
- Three-tier cache: `localStorage` last-known snapshot for cold-start paint, React Query for in-memory freshness with per-source TTLs, Workbox for cross-session offline replay (see [local-storage.md](./local-storage.md))
- Custom CSS animations in `index.css`, layered on Tailwind utilities
- Lazy-loaded heavy modules (`HourlyForecast`, `DailyForecast`, `RainfallMap`, `MSCRainfallMap` via `React.lazy` + `Suspense`); the map chunk only loads once the user opts into the nowcast map
- Minified production build via Vite
- Preconnect/dns-prefetch hints for external APIs and basemap tiles
- Shared `Intl.DateTimeFormat` cache (`src/lib/utils.ts`) avoids per-render formatter construction
- `LocalClock` isolates the per-tick re-render so the rest of the current-weather card stays referentially stable. The tick interval adapts to the displayed precision: 1s while seconds are visible on `sm+`, 60s when dropped below `sm`; it re-binds on viewport changes via `matchMedia`
- All diagnostic logging no-ops in production builds (gated on `import.meta.env.PROD`)
