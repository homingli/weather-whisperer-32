# Optimization Opportunities

## Critical — Nowcast Loading on Mobile

| # | Issue | Location | Impact |
|---|---|---|---|
| 1 | CSV download (2.7MB, 58K rows) has no timeout — bare `fetch()` not `fetchWithTimeout` | `RainfallMap.tsx:219` | Spinner freezes indefinitely on slow mobile connections |
| 2 | React Query default retry (3 retries, exponential backoff 1s→2s→4s) multiplies wait time on failure | RainfallMap `useQuery` (no custom retry) | User waits up to 4× download + 7s backoff before seeing error state |
| 3 | All-or-nothing `response.text()` — no streaming or progress indicator | `RainfallMap.tsx:220` | User sees spinner with no feedback during 10-15s download on 3G |

## Moderate — Bundle / Build

| # | Issue | Detail |
|---|---|---|
| 4 | Main JS chunk 993KB (298KB gzip) exceeds Vite's 500KB recommendation | Leaflet + Recharts are bulk contributors. Consider `manualChunks` or code-splitting map from main dashboard. |

## Low — Code Quality

| # | Issue | Detail |
|---|---|---|
| 5 | `QueryClient` created bare in `App.tsx` — no global defaults | Both query consumers duplicate staleTime/retry config. Adding `defaultOptions` reduces duplication. |
| 6 | CSV parsing is synchronous, blocks main thread ~100-300ms on slow devices | `parseRainfallCSV` creates 26K+ GeoJSON features in one shot. Could defer to chunked work or Web Worker. |
| 7 | `isLoaded` state + Query `enabled` flag are redundant | Equivalent to one extra render cycle. Could unify to just `enabled` + overlay. |

## Status

- [x] 1. Add fetch timeout (10s) to nowcast CSV fetch
- [x] 2. Disable retry for `hkoGriddedRainfallNowcast` query
- [x] 3. Show download progress — streaming fetch with Content-Length, progress bar during first load, thin bar during background refetch. refetchInterval set to 30min to match HKO cadence.
- [x] 4. Chunk splitting — lazy-loaded RainfallMap splits Leaflet (165KB) from main bundle (827KB vs 993KB)
- [x] 5. QueryClient global defaults — `retry: 1`, `staleTime: TIMING.STALE_TIME_MS` on `App.tsx` QueryClient
- [ ] 6. Web Worker parsing (deferred)
- [x] 7. Simplify isLoaded/enabled — removed redundant `isLoaded &&` from spinner condition (`isLoading` already implies query is active)
