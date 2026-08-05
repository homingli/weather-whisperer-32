/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
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
}));
