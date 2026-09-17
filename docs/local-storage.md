# Local storage and caching

The application persists the following to `localStorage`:
- `weather-default-city`: the last selected GeoLocation
- `weather-recent-cities`: up to 3 recent cities (capped, MRU)
- `weather-language`: user language preference (`'en' | 'tc'`)
- `theme-mode`: user theme preference (`'light' | 'dark' | 'auto'`)
- `weather-last-known-v2`: schema-versioned, lz-string compressed envelope of the last successful weather fetch. Read synchronously at mount as the cold-start seed; cleared on city switch; overwritten on every successful fetch.
- `weather-units`: preferred unit system, `'metric'` (default: °C / km/h / mm) or `'us'` (°F / mph / in). Read at `UnitsContext` mount, written on toggle.
- `weather-font-size`: UI text scale (`'small' | 'medium'` (default) `| 'large'`), applied as a percentage root font-size. Read at `FontSizeContext` mount, written on change.
- `weather-nowcast-cache-v2`: schema-versioned, LZString-compressed snapshot of the gridded rainfall nowcast CSV (~2.7 MB raw). Read at mount to skip the "Load Map" prompt when fresh (15-min TTL).

Cache strategy is a three-tier design:

1. **`localStorage` last-known snapshot.** Synchronous read at mount, lz-string compressed, cleared on city switch
2. **React Query.** Per-tab in-memory, the single source of truth at runtime. Per-source TTLs (OM 5min current, OM 30min daily, HKO 1min warnings, geocoding 7d) collapse to 1 min when any source has failed. Persistence via `@tanstack/query-sync-storage-persister` bridges page reloads.
3. **Workbox service worker.** Cross-session `NetworkFirst` cache, 50 entries / 24h per bucket, replayed when fully offline. Buckets: `api-cache` (direct API hosts), `hko-proxy-cache` (dev Vite proxy / prod Vercel rewrite), `msc-tile-cache` (GeoMet WMS tiles, StaleWhileRevalidate), `carto-basemap-cache` (versioned basemap tiles, CacheFirst). See the workbox config in `vite.config.ts` for the freshness trade-offs.

All icon assets (map marker, 20 HKO warning GIFs) are locally hosted under `public/icons/`. No external CDN dependencies.
