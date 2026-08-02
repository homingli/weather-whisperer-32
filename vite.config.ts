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
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            },
          },
          // HKO data is proxied via the local origin in dev (Vite proxy) and
          // via Vercel rewrites in prod, so the browser-visible URL is the
          // local origin. A separate cache entry keeps dev/prod offline
          // behavior aligned.
          {
            urlPattern: /\/hko-data\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'hko-proxy-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 1 day
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
