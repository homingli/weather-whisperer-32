/// <reference types="vitest" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (mode === 'production' && !env.VITE_CARTO_API_KEY?.trim()) {
    throw new Error('VITE_CARTO_API_KEY is required for production builds');
  }

  return ({
  server: {
    host: "::",
    port: 8080,
    allowedHosts: ['.lh'],
    proxy: {
      '/hko-data': {
        target: 'https://data.weather.gov.hk/weatherAPI/hko_data',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hko-data/, '')
      }
    }
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    // Progressive Web App support
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Weather Whisperer',
        short_name: 'Weather',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#4f46e5',
        icons: [
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Basic offline caching; no push notifications by default
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(api\.open-meteo\.com|geocoding-api\.open-meteo\.com|data\.weather\.gov\.hk|nominatim\.openstreetmap\.org)\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 1 day
                // ~5 MB cap per bucket; nowcast CSV (~2.7 MB) is large so the
                // 50-entry × 2.7 MB worst-case (~135 MB) was unbounded before.
                purgeOnQuotaError: true,
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            },
          },
          // HKO data is proxied via the local origin in dev (Vite proxy) and
          // via Vercel rewrites in prod, so the browser-visible URL is the
          // local origin. A separate cache entry keeps dev/prod offline
          // behavior aligned. The nowcast CSV (up to ~2.7 MB with 30 s
          // timeout) benefits from StaleWhileRevalidate so the user sees
          // the cached map instantly while a fresh fetch refreshes the
          // background copy — NetworkFirst would block page paint for the
          // full timeout on every cold load.
          //
          // Time-sensitivity tradeoff: SWR serves whatever's in the cache
          // (up to `maxAgeSeconds` old) while revalidating in the background.
          // A stale nowcast shown while the background fetch fails = wrong
          // forecast forever. We pin `maxAgeSeconds` to the HKO generation
          // cadence (`NOWCAST_REFETCH_INTERVAL_MS = 30 min`) so the SW
          // evicts and forces a fresh fetch before stale data accumulates.
          // If you loosen this, weigh the offline UX against forecast
          // correctness — a longer cap = snappier offline, more likely to
          // show outdated rain.
          // MSC nowcast tiles come from GeoMet (geo.weather.gc.ca). GeoMet
          // already sends Cache-Control: max-age=3600, but the SW rule keeps
          // tiles available offline / instantly on revisit and bounds the
          // cache (small PNGs; 200 entries ≈ ~1 MB worst case). Tiles are
          // time-stamped, so keep the cap at the 1h GeoMet freshness window
          // to avoid serving an outdated forecast.
          {
            urlPattern: /^https:\/\/geo\.weather\.gc\.ca\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'msc-tile-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60, // 1h, matches GeoMet max-age
                purgeOnQuotaError: true,
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            },
          },
          // Carto basemap tiles (used by both nowcast maps, light + dark) are
          // effectively immutable per style — Carto versions them on the CDN
          // path, so there is no freshness need. CacheFirst + 7d so revisits
          // don't re-fetch the whole basemap (the largest repeat-visit cost),
          // while maxEntries + purgeOnQuotaError bound the quota on mobile.
          {
            urlPattern: /^https:\/\/(?:[a-d]\.)?basemaps\.cartocdn\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'carto-basemap-cache',
              expiration: {
                maxEntries: 300,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7d — versioned/immutable
                purgeOnQuotaError: true,
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            },
          },
          {
            urlPattern: /\/hko-data\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'hko-proxy-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 30 * 60, // 30 min, matches NOWCAST_REFETCH_INTERVAL_MS
                purgeOnQuotaError: true,
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
  });
});
