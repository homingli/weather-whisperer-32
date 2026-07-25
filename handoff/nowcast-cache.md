# Nowcast cache (15-min TTL, LZString-compressed)

Status: implemented, working tree only (no commit yet).

## Caching layers

The `Gridded_rainfall_nowcast.csv` (~2.7 MB raw) was previously served via two layers:

1. **React Query** (in-memory, per-tab). `staleTime: 5 min`, `refetchInterval: 30 min` (`NOWCAST_REFETCH_INTERVAL_MS`). Lost on page refresh; refetched in full on remount.
2. **Workbox service worker** (`/hko-data/*` bucket). `NetworkFirst` with 24h max age. Network is always hit first, so even a valid SW cache adds latency on every fetch.

Neither layer survives a refresh with zero work. The new layer fixes that.

## New layer: localStorage cache (this change)

- **Module:** `src/lib/nowcastCache.ts` — schema-versioned envelope (`v`, `cachedAt`, `csvText`, `updateTime`, `lastModified`), mirrors the existing `storage.ts` pattern.
- **Storage key:** `weather-nowcast-cache-v1` (`STORAGE_KEYS.NOWCAST_CACHE`).
- **TTL:** 15 min (`TIMING.NOWCAST_CACHE_TTL_MS = 15 * 60 * 1000`). Aligned with HKO's 30-min generation cadence so the next refetch always sees a fresh file (worst case: cache expires 5 min before the next file lands).
- **Compression:** `csvText` is `LZString.compress()`-ed before `localStorage.setItem`. The raw CSV (~2.7 MB) drops to ~1.0–1.2 MB on disk (~55–60% reduction on the highly structured numeric CSV). `readNowcastCache` decompresses transparently so callers always see raw CSV. Sync API — no async round-trip on the critical mount path.
- **Schema:** `NOWCAST_CACHE_SCHEMA_VERSION = 2` (v2 = LZString-compressed csvText; v1 stored raw CSV and is dropped on read instead of silently failed-decompressed).
- **Failure modes:** parse error / version mismatch / wrong types / `LZString.decompress` returning null → silently drop with `logWarn`. `localStorage.setItem` quota / private-mode errors are swallowed (cache is best-effort). Some corrupt blobs pass through LZString as garbage strings; the downstream `parseRainfallCSVText` then fails to extract a grid and the inner component falls back to a network fetch.

## Behavior change in `RainfallMap.tsx`

The outer wrapper now reads the cache synchronously at mount via `useMemo`:

```ts
const initialCachedCsv = useMemo(() => readNowcastCache()?.csvText ?? null, []);
const [isLoaded, setIsLoaded] = useState(initialCachedCsv !== null);
```

- Fresh cache hit → `isLoaded=true` on first render → the "Load Map" prompt is **skipped entirely** and the inner component mounts directly.
- No cache → original behavior: user clicks "Load Map" before any fetch starts.

A `useEffect` preloads the lazy leaflet chunk in parallel with the React tree render so the inner component usually lands with the chunk already in memory (no Suspense fallback flash).

## Behavior change in `RainfallMapInner.tsx`

The inner component now accepts `initialCsv?: string | null` and parses it once at mount into a `NowcastResult`, then hands it to React Query:

```ts
const cachedResult = useMemo(() => { /* parse initialCsv */ }, [initialCsv]);

useQuery({
  queryKey: ['hkoGriddedRainfallNowcast'],
  queryFn: async () => { /* fetch + writeNowcastCache */ },
  staleTime: TIMING.NOWCAST_CACHE_TTL_MS,
  initialData: cachedResult ?? undefined,
  initialDataUpdatedAt: cachedResult ? Date.now() : 0,
  refetchInterval: (query) => {
    const cachedAt = query.state.dataUpdatedAt;
    if (!cachedAt) return TIMING.NOWCAST_CACHE_TTL_MS;
    const timeUntilExpiry = cachedAt + TIMING.NOWCAST_CACHE_TTL_MS - Date.now();
    return Math.max(timeUntilExpiry, 60_000);
  },
  retry: 0,
});
```

- `staleTime: 15 min` matches the cache TTL → React Query treats cached data as fresh; no fetch on mount, focus, or reconnect.
- `refetchInterval` aligns with `cachedAt + TTL` so background refreshes and cache invalidation fire together.
- `writeNowcastCache(csvText, parsed.updateTime, lastModified)` runs inside `fetchRainfallNowcast` after a successful parse → every fresh fetch automatically updates the cache.

### Map lock/unlock fix for the cache path

A separate bug surfaced after the cache work: the lock useEffect (`applyMapLockState`) only ever ran once on mount when `[data, isLoading]` were stable (the cache-hit path), and at that moment `mapRef.current` was still `null` because react-leaflet's `useImperativeHandle` fires in a later commit cycle. The effect early-returned and the map stayed locked from the initial `MapContainer` props.

Fix: extracted the lock logic into a `useCallback`-memoized helper invoked from BOTH a `useEffect` (handles state transitions) AND a callback `ref` on `MapContainer` (handles the initial mount when react-leaflet's ref finally lands). The map's `dragging` / `scrollWheelZoom` / etc. are now correctly enabled on cache load.

## Test coverage

- `src/lib/nowcastCache.test.ts` (20 tests) — round-trip, stale, version mismatch, missing fields, parse error, quota failures, LZString compression on disk, v1→v2 schema bump rejection, 1.5 MB realistic-CSV round-trip, garbage-blob safety.
- `src/components/RainfallMap.test.tsx` (+4 tests):
  - "skips the Load Map prompt and renders directly from cache when fresh"
  - "shows the Load Map prompt again after the cache is cleared"
  - "enables map interactions (drag / zoom / keyboard) when loaded from cache"
  - "locks map interactions during initial fetch and unlocks after data arrives"
- Test mock for `MapContainer` upgraded to a `forwardRef` stub that invokes the parent's ref callback with the stub map. Previously the ref was lost (regular function component doesn't receive `ref` as a prop in React 18), masking the lock effect bug.

All 199 tests pass (`npx vitest run`).

## Dependency

`lz-string@1.5.0` exact-pinned via pnpm. No lifecycle scripts (verified `scripts: {}` in package.json). Adds ~5 KB gzipped to the bundle. Not used anywhere else.

## Known limitations

- **Cross-tab:** each tab has its own React Query cache but shares the localStorage cache. A 15-min TTL bounds staleness across tabs; no `storage` event listener (out of scope for this change).
- **Service worker unchanged:** the Workbox `/hko-data/*` bucket still runs NetworkFirst. With a fresh localStorage cache we bypass fetch entirely, so SW is moot. With an expired cache, the SW cache may serve a stale file (24h max age), but the network round-trip happens regardless.
- **CSV size:** ~1.0–1.2 MB LZString-compressed CSV in localStorage — well within the 5 MB quota. The write is wrapped in try/catch, so a quota error silently degrades to the no-cache path.

## Not committed

Project rule: "Never commit unless asked." This handoff describes what was done; the user can review and commit when ready.