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
// `MAX_AGE_MS` skips the cold-fetch spinner (the cold-start last-known
// snapshot still seeds the first paint). Stale-while-revalidate: cached
// queries are returned immediately; React Query will refetch in the
// background if they're stale.
persistQueryClient({
  queryClient,
  persister,
  // 30 min — comfortably past the healthy 5-min refetch cadence, so even
  // a user who reloads mid-session gets instant data with a single silent
  // background refresh on mount.
  maxAge: 30 * 60_000,
  buster: PERSIST_SCHEMA_VERSION,
  dehydrateOptions: {
    // Only persist successful query data; errors would still show the
    // offline banner on reload but without dragging error objects into
    // the serialized blob.
    shouldDehydrateQuery: (query) =>
      query.state.status === 'success' && !!query.state.data,
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
