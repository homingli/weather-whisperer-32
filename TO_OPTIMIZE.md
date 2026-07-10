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
- [ ] 3. Show download progress (deferred — requires streaming + state)
- [ ] 4. Chunk splitting (deferred)
- [ ] 5. QueryClient global defaults (deferred)
- [ ] 6. Web Worker parsing (deferred)
- [ ] 7. Simplify isLoaded/enabled (deferred)
