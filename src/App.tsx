import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/query-persist-client-core";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { UnitsProvider } from "@/contexts/UnitsContext";
import { StatusRegionProvider } from "@/lib/aria-utils";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { TIMING } from "@/lib/constants";
import { persister, PERSIST_SCHEMA_VERSION } from "@/lib/queryPersistence";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: TIMING.STALE_TIME_MS,
    },
  },
});

// Persist query cache to localStorage so a tab refresh within
// `maxAge` below skips the cold-fetch spinner. Stale-while-revalidate:
// cached queries are returned immediately; React Query will refetch
// in the background if stale.
//
// === Race with the cold-start snapshot (see useWeatherWithProgress) ===
//
// Two paths seed the weather-unified query on first paint:
//   1. `useWeatherWithProgress`'s `readLastKnownWeather(cityId)?.data`
//      via `initialData` + `initialDataUpdatedAt: 0` — forces a stale
//      state so a background fetch fires.
//   2. `persistQueryClient.restoreClient()` (async, runs at module
//      init) writing the cached `PersistedClient` back into the same
//      queryKey with its real `dataUpdatedAt`.
//
// Path 2 wins on reload when localStorage holds a non-stale entry: the
// cached entry's `dataUpdatedAt` is preserved, the query is treated as
// fresh against `staleTime`, and TanStack does NOT fire a background
// refetch until that window passes. That is the intended behavior —
// only reloads past `maxAge` (or where persisted cache is missing /
// `buster`-mismatched) fall back to path 1.
//
// `refetch()` on the user-action refresh button bypasses this gate
// unconditionally; no separate plumbing needed here.
persistQueryClient({
  queryClient,
  persister,
  // 30 min — comfortably past the healthy 5-min refetch cadence, so even
  // a user who reloads mid-session gets instant data with a single silent
  // background refresh on mount.
  maxAge: 30 * 60_000,
  buster: PERSIST_SCHEMA_VERSION,
  dehydrateOptions: {
    // Persist any query that holds a usable payload. Covers successful
    // queries AND TanStack v5's "error with retained previous data"
    // (the query's last-known-good data survives a transient refetch
    // failure, so we want the persister to survive the same transition).
    // Skips genuinely-empty states: idle, pending, and hard errors
    // with no prior data.
    shouldDehydrateQuery: (query) => query.state.data != null,
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <LanguageProvider>
        <UnitsProvider>
          <StatusRegionProvider>
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </StatusRegionProvider>
        </UnitsProvider>
      </LanguageProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
