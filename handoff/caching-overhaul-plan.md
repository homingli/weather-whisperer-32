# Caching overhaul — implementation plan

Branch: `feat/caching-overhaul`
Status: plan for review (no code yet)
Owner: pi session, 2026-07-22

---

## 1. Summary

Replace the current two-tier (Workbox + React Query in-memory) cache with a
**three-tier cache** that gives the user a meaningful "live / partial / offline"
signal at all times:

1. **React Query** (per-tab in-memory) — single source of truth at runtime.
2. **Service Worker / Workbox** (cross-session Cache Storage) — offline HTTP
   replay for the same 4 external hosts we already cover, plus the local-origin
   `/hko-data/*` proxy so dev and prod behave identically offline.
3. **`localStorage` last-known snapshot** (synchronous read at mount) —
   bootstrap for instant first paint on cold load. Cleared on city switch,
   overwritten on every successful fetch. Schema-versioned.

A new **`WeatherData.sources`** field carries per-source `cachedAt`, `ok`, and
`isExpired` so the UI can render the right banner tone (none / amber / red) and
tell the user *which* source is missing.

This also closes three existing doc/code gaps: retry count, theme-mode values,
and the misleading "force-clear local caches" manual-refresh copy.

---

## 2. Background

Scout recon surfaced the following baseline (`/Users/homingli/Github/weather-whisperer-32/.pi-subagents/artifacts/outputs/e47f3337/context.md`):

- **Two tiers today.** Workbox `NetworkFirst` for 4 hosts (24h, 50 entries);
  React Query `staleTime: 5min` collapsing to `1min` on HKO failure. No app-level
  persistence.
- **`localStorage` is for prefs only** (`theme-mode`, `weather-language`,
  `weather-default-city`, `weather-recent-cities`). Confirmed: no weather
  payload is ever written there.
- **Three dead UX paths.** `WeatherData.fallbackSource: 'cache'` is declared
  but never written; `WeatherData.isExpiredCache` is declared but never written;
  `data.usingCached` translation key is missing, so the offline label renders
  the raw key string. The user-facing "force-clear local caches" button only
  calls React Query `refetch()`.
- **Three doc/code mismatches.** Retry says `3` in docs, code is `1`; theme
  values `light|dark|system` in README, code is `light|dark|auto`; manual
  refresh button overpromises.
- **Dev/prod offline drift.** Vite dev proxy `/hko-data/*` → HKO and the
  Vercel rewrite `vercel.json` both rewrite the URL to the local origin in
  dev, but Workbox `urlPattern` only matches the four external hosts. SW
  caching therefore works in production for HKO but not in dev.

---

## 3. Goals & non-goals

### Goals

- Show a per-source freshness signal in the UI (none / partial / offline).
- Persist a single "last known" weather snapshot in `localStorage` so cold-load
  renders instantly, then refresh from the network.
- Treat city switch as a hard cache reset for the snapshot.
- Align dev and prod offline behavior for the HKO proxy.
- Match React Query `staleTime` / `refetchInterval` to each source's natural
  update cadence.
- Fix the three doc/code mismatches in `ARCHITECTURE.md` and `README.md`.

### Non-goals

- No service worker rewrite. Workbox `NetworkFirst` is fine; we only extend the
  `urlPattern`.
- No `@tanstack/react-query-persist-client` adoption. The localStorage snapshot
  is app-level, not a React Query hydration layer.
- No IndexedDB / Cache-Control header manipulation.
- No per-field TTLs inside a payload — the whole source has one TTL (the
  shortest-lived field's cadence).
- No new dependencies.

---

## 4. Locked-in decisions

| # | Decision |
|---|---|
| D1 | Cache layering is read top-down on cold load: `localStorage` → React Query → Workbox → network. Failures fall back down. |
| D2 | On cold load: render `localStorage` immediately (no loading state), then fire React Query. On success: paint fresh + overwrite localStorage. On failure: keep cache visible, set `isFallback`, `fallbackSource`, per-source `isExpired`. |
| D3 | Manual refresh calls React Query `refetch()`. If it fails, fall back to the localStorage snapshot (do not clear it). |
| D4 | `cachedAt` is per source, written on each source's successful fetch. |
| D5 | `isExpired` is a hard cutoff: `Date.now() - cachedAt > sourceTtl`. Simplest, no downstream effects. |
| D6 | localStorage key: `weather-last-known-v1`. Schema versioned. Stored payload includes `{ cityId, fetchedAt, data: WeatherData }`. |
| D7 | localStorage is evicted on city switch (overwritten by the new city's first successful fetch). One snapshot at a time. |
| D8 | Banner tones: none (live) / amber (`partial` — one source missing, name the working one) / red (`offline` — both missing, show timestamp, expose "refetch" button). |
| D9 | `retry: 1` stays (2 attempts total). Doc is updated to match. |
| D10 | Workbox `urlPattern` extended to cover local-origin `/hko-data/*` for dev parity. |

---

## 5. Target architecture

```
                ┌──────────────────────────────────────────┐
                │           App mount (synchronous)         │
                │  read localStorage 'weather-last-known-v1'│
                │  seed React Query initialData            │
                └────────────────────┬─────────────────────┘
                                     │
                                     ▼
        ┌────────────────────────────────────────────────────────┐
        │  React Query (in-memory, per-tab, single source of truth)│
        │  queryKey: ['weather-unified', lang, lat, lon]         │
        │  initialData: snapshot | undefined                     │
        │  staleTime: per-source TTL                             │
        │  refetchInterval: per-source TTL                       │
        │  placeholderData: keepPreviousData                     │
        │  retry: 1                                              │
        └────────────────────────┬───────────────────────────────┘
                                 │ queryFn → fetchWeather
                                 ▼
        ┌────────────────────────────────────────────────────────┐
        │  weather-manager.ts (orchestrator)                     │
        │  per-source: { ok, cachedAt, ttlMs, isExpired }       │
        │  on success → write localStorage snapshot              │
        │  on failure → set isFallback / fallbackSource          │
        └────────────────────────┬───────────────────────────────┘
                                 │ fetchWithTimeout
                                 ▼
        ┌────────────────────────────────────────────────────────┐
        │  Workbox Service Worker (Cache Storage API)            │
        │  NetworkFirst, api-cache, 50 entries / 24h             │
        │  hosts: api.open-meteo.com, geocoding-api.open-meteo.com,│
        │         data.weather.gov.hk, nominatim.openstreetmap.org,│
        │         local origin /hko-data/*                       │
        └────────────────────────┬───────────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │     Upstream APIs      │
                    │  Open-Meteo / HKO / Nominatim │
                    └────────────────────────┘
```

---

## 6. Data model

### 6.1 New `SourceState`

```ts
// src/lib/weather/types.ts

export type SourceId = 'om' | 'hko';

export type SourceState = {
  ok: boolean;        // did the most recent fetch attempt succeed?
  cachedAt: number;   // epoch ms of last successful fetch for this source
  ttlMs: number;      // source-specific TTL
  isExpired: boolean; // computed: Date.now() - cachedAt > ttlMs
};
```

### 6.2 `WeatherData` additions

```ts
export type WeatherData = {
  // ... existing fields unchanged ...

  // Existing fallback flags — semantics clarified, not removed
  isFallback?: boolean;
  fallbackSource?: 'HKO' | 'cache' | 'partial';
  isExpiredCache?: boolean;

  // New: per-source freshness
  sources?: Partial<Record<SourceId, SourceState>>;
};
```

`fallbackSource` after the change:

| Value | Meaning |
|---|---|
| `'HKO'` (legacy) | HK location, OM unavailable, HKO carries the show. Banner: legacy HKO message. |
| `'cache'` | Both sources unavailable, payload is fully from `localStorage`. Banner: red offline. |
| `'partial'` | One source live, one from cache (or both failed but only one has a usable cached copy). Banner: amber. |

`isFallback` continues to mean "any data shown is not fully live." UI can short-circuit on this without inspecting `fallbackSource`.

### 6.3 `localStorage` envelope

```ts
// Not exported — internal to storage.ts
type LastKnownEnvelope = {
  v: 1;                              // schema version
  cityId: string;                    // `${latitude.toFixed(2)},${longitude.toFixed(2)}`
  lang: 'en' | 'tc';                 // language of the cached payload
  fetchedAt: number;                 // epoch ms of the most recent successful fetch
  data: WeatherData;                 // payload, including the new sources field
};
```

Stored under `STORAGE_KEYS.LAST_KNOWN` (new constant). Read with try/catch + version guard. Drop on any parse or version mismatch.

---

## 7. TTL table

Centralized in `src/lib/constants.ts` under `TIMING`. All values in milliseconds.

| Constant | Value | Used by |
|---|---|---|
| `TIMING.STALE_TIME_MS` (existing) | `5 * 60_000` | OM current / hourly staleTime (kept) |
| `TIMING.REFETCH_INTERVAL_MS` (existing) | `5 * 60_000` | OM current / hourly refetch (kept) |
| `TIMING.REFETCH_ON_FAILURE_MS` (existing) | `1 * 60_000` | HKO failure cadence (kept) |
| `TIMING.OM_FORECAST_TTL_MS` (new) | `30 * 60_000` | OM daily forecast staleTime |
| `TIMING.OM_FORECAST_REFETCH_MS` (new) | `30 * 60_000` | OM daily forecast refetch |
| `TIMING.HKO_WARNINGS_TTL_MS` (new) | `1 * 60_000` | HKO warnings / storm signal staleTime |
| `TIMING.HKO_WARNINGS_REFETCH_MS` (new) | `1 * 60_000` | HKO warnings refetch |
| `TIMING.HKO_FORECAST_TTL_MS` (new) | `30 * 60_000` | HKO 9-day forecast staleTime |
| `TIMING.HKO_FORECAST_REFETCH_MS` (new) | `30 * 60_000` | HKO 9-day forecast refetch |
| `TIMING.NOWCAST_REFETCH_MS` (existing) | `30 * 60_000` | Gridded rainfall nowcast refetch (kept) |
| `TIMING.GEOCODING_TTL_MS` (new) | `7 * 24 * 60 * 60_000` | Search + reverse geocode staleTime |
| `TIMING.GEOCODING_REFETCH_MS` (new) | `7 * 24 * 60 * 60_000` | Geocode refetch |
| `TIMING.WORKBOX_MAX_AGE_SEC` (existing) | `86_400` | Workbox cache TTL (kept) |
| `TIMING.WORKBOX_MAX_ENTRIES` (existing) | `50` | Workbox cache size (kept) |

Rationale:
- OM current/hourly: 5 min — OM updates roughly hourly; current conditions are
  the volatile slice.
- OM daily: 30 min — daily forecast changes at most a few times per day.
- HKO warnings: 1 min — push-driven, sub-minute user expectation.
- HKO 9-day forecast: 30 min — matches HKO update cadence.
- Nowcast: 30 min — HKO generation cadence is ~6 min but 30 min is the
  existing cadence (already in `RainfallMap.tsx`); left as-is for now.
- Geocoding: 7 d — place names are stable.

---

## 8. File-by-file change list

### 8.1 Types — `src/lib/weather/types.ts`

Add `SourceId`, `SourceState`. Extend `WeatherData` with `sources`. Keep
existing `isFallback`, `fallbackSource`, `isExpiredCache` (re-purpose
semantics).

### 8.2 Constants — `src/lib/constants.ts`

Add `STORAGE_KEYS.LAST_KNOWN = 'weather-last-known-v1'`. Add the new
`TIMING.*` constants from §7.

### 8.3 Storage — `src/lib/weather/storage.ts`

Add three helpers (in addition to existing city helpers):

```ts
readLastKnownWeather(): LastKnownEnvelope | null;
writeLastKnownWeather(cityId: string, lang: 'en' | 'tc', data: WeatherData): void;
clearLastKnownWeather(): void;
```

Behavior:
- `read`: try/catch JSON parse; on error, drop and return `null`. Version
  mismatch (`v !== 1`) → drop and return `null`. Different `cityId` than
  current → return `null` (treat as empty; orchestrator will overwrite).
- `write`: serializes, calls `localStorage.setItem` inside try/catch.
- `clear`: removes the key. Called by `useSelectedCity` on city switch.

Export `LAST_KNOWN_SCHEMA_VERSION = 1`.

### 8.4 Orchestrator — `src/lib/weather-manager.ts`

Refactor to:
1. Accept a `language` param and return `WeatherData` with `sources` populated.
2. For each source attempt, capture `ok`, compute `cachedAt = Date.now()` on
   success, set `isExpired = false`.
3. If a source fails, look up the previous attempt's `cachedAt` from the
   `localStorage` snapshot (if any) and compute `isExpired` against the
   source's TTL. Set `ok: false`.
4. Determine `fallbackSource`:
   - both `ok`: omit / `'HKO'` for legacy HK-only paths.
   - exactly one `ok`: `'partial'`. UI names the working source from
     `sources[workingId]`.
   - both `!ok`: `'cache'`.
5. Set `isFallback: true` if any source is `!ok`.
6. Set `isExpiredCache: true` if all available cached sources are expired.
7. On any partial success, call `writeLastKnownWeather(cityId, lang, data)`.

Concrete signature:

```ts
export type FetchWeatherOptions = {
  onProgress?: (state: SourceLoadState) => void;
};

export async function fetchWeather(
  latitude: number,
  longitude: number,
  language: Language,
  options: FetchWeatherOptions = {},
): Promise<WeatherData>;
```

Existing callers (`useWeatherWithProgress`) need only the new `language`
parameter; pass-through is trivial.

### 8.5 Hook — `src/hooks/useWeatherWithProgress.ts`

Changes:
- Compute `cityId` (`${lat.toFixed(2)},${lon.toFixed(2)}`) and pass to
  `queryFn` so the orchestrator can key its write.
- Read `readLastKnownWeather()` on first render. If non-null and `cityId`
  matches, use it as `initialData` (with `sources` already populated). Wrap
  the read in a guard so it only runs once per mount.
- Adjust `hasFailure` derivation to inspect `weather.sources`. Both
  `!sources.om?.ok && !sources.hko?.ok` triggers failure cadence; either
  `!ok` keeps the existing 1-min cadence for HKO-warning TTL.
- Use new TTLs for `staleTime` / `refetchInterval` (driven by source state).

### 8.6 Hook — `src/hooks/useSelectedCity.ts`

On city switch (`setSelectedCity`), call `clearLastKnownWeather()` before the
next successful fetch overwrites it. This keeps the snapshot's `cityId`
invariant and avoids painting stale cross-city data briefly during the
transition.

### 8.7 Banners — `src/components/WeatherBanners.tsx`

Three branches:
1. `!isFallback` → render nothing (or a no-op).
2. `fallbackSource === 'partial'` → amber banner with localized copy:
   "Showing partial data only with {workingSourceName}." Button: optional
   "Refetch" affordance.
3. `fallbackSource === 'cache'` → red banner with localized copy:
   "Currently offline: showing cached data from {timestamp}." Button:
   "Refetch live data" → calls `refetch()`.
4. `fallbackSource === 'HKO'` → keep existing legacy message.

The component takes `weather: WeatherData` and a `refetch: () => void` prop
(no hook coupling).

### 8.8 Page — `src/pages/Index.tsx`

- Replace the current `cacheLabel` (which uses the missing `data.usingCached`
  key) with `weather?.isFallback ? <WeatherBanners ... /> : null`.
- Pass `refetch` and `language` into `WeatherBanners`.

### 8.9 SW config — `vite.config.ts`

Extend Workbox `urlPattern` to cover the local-origin HKO proxy:

```ts
urlPattern: ({ url }) => {
  const externalHosts = [
    'api.open-meteo.com',
    'geocoding-api.open-meteo.com',
    'data.weather.gov.hk',
    'nominatim.openstreetmap.org',
  ];
  if (externalHosts.includes(url.hostname)) return true;
  if (url.pathname.startsWith('/hko-data/')) return true;
  return false;
},
```

Or keep regex form with two entries. Add a second `runtimeCaching` block
with the same options for `/hko-data/*` if `urlPattern` doesn't accept a
function (it does in Workbox v7+; verify before commit).

### 8.10 SW config — `vercel.json`

The existing rewrite `/hko-data/:path*` → `https://data.weather.gov.hk/...`
already routes the request to the local origin in prod. No change needed.
Confirm during implementation that the SW `urlPattern` matches the local
origin (it should, since the rewrite lands on the user's host).

### 8.11 i18n — `src/contexts/LanguageContext.tsx`

Add to both `en` and `tc` dictionaries:

```ts
data: {
  // ...
  usingCached: 'Showing cached data',  // legacy alias; consider deprecating
  partialData: (source: string) => `Showing partial data only with ${source}`,
  offline: (timestamp: string) => `Currently offline: showing cached data from ${timestamp}`,
  refetchLive: 'Refetch live data',
},
```

Source-name labels come from existing `HKOTranslations` / `OMTranslations`
additions if needed; otherwise use a generic `t('source.openMeteo')` /
`t('source.hko')` lookup. Add those if missing.

---

## 9. Test plan

Existing tests (133) need to keep passing. New tests to add:

### Unit

- `src/lib/weather/storage.test.ts` (new): envelope round-trip, version
  mismatch drop, parse error drop, cityId mismatch drop.
- `src/lib/weather-manager.test.ts` (extend): verify `sources` field is
  populated for both success and failure paths; verify `fallbackSource`
  transitions (`'HKO'` / `'partial'` / `'cache'`); verify
  `writeLastKnownWeather` is called only on success.
- `src/lib/constants.test.ts` (new if missing, else extend): all new
  `TIMING.*` constants are positive integers.

### Component

- `src/components/WeatherBanners.test.tsx` (new): three banner branches
  render correct tone + copy; refetch button invokes callback.
- `src/pages/Index.test.tsx` (new if missing): cold-load path reads
  localStorage; refetch button works on cached payload; city switch
  clears snapshot.

### Manual QA

1. **Cold load with stale cache.** Set localStorage to a 2-hour-old snapshot,
   reload, confirm: immediate paint with red banner + "cached from HH:MM" +
   refetch button. After ~2s, fresh fetch lands, banner clears.
2. **Cold load with fresh cache.** Set localStorage to a 1-min-old snapshot,
   reload, confirm: immediate paint with no banner, then fetch refreshes in
   the background.
3. **One source down.** Use DevTools network throttling to drop HKO. Confirm:
   amber banner "Showing partial data only with Open-Meteo." After HKO
   recovers, banner clears on next poll.
4. **Offline + cached.** Toggle DevTools offline. Confirm: red banner,
   timestamp shown, refetch button visible (and fails). Toggle online.
5. **City switch.** From Hong Kong → Tokyo. Confirm: localStorage key is
   replaced; no Tokyo banner mentions HK data; refetch fires.
6. **Dev HKO proxy offline.** `npm run dev`, open DevTools → Application →
   Service Workers → confirm `/hko-data/*` is in the cache list after a
   successful fetch. Block the request in DevTools → Network → confirm the
   cached response is replayed.

### Existing tests to watch

- `src/test/Integration.test.tsx` — uses fake timers; ensure new initial-data
  seeding doesn't bypass the fake timer flow.
- `src/lib/weather-manager.test.ts` — current 13 tests assume HKO `ok: true`
  path; add coverage for `ok: false` per source.

---

## 10. Doc updates

### `ARCHITECTURE.md`

- **Data Flow Diagram**: insert `localStorage last-known` layer above React
  Query; show per-source `cachedAt` flow.
- **Caching & Retry Strategy**:
  - Update retry count to `1` (was `3`).
  - Document `WeatherData.sources` and `fallbackSource: 'partial' | 'cache'`.
  - Document per-source TTLs from §7.
  - Document Workbox `urlPattern` covering local-origin `/hko-data/*`.
- **Service Worker** section: add note that dev/prod parity is now enforced
  via the local-origin pattern.
- **`localStorage` Persistence**: add row for `weather-last-known-v1`.
- **Fallback Chain** table: add rows for `'partial'` and `'cache'` outcomes.

### `README.md`

- **Features**:
  - Update "Manual Data Refresh" copy: "Force-clear local caches…" → "Fetch
    fresh data on demand; falls back to the last cached snapshot if the
    source is unreachable."
  - Add a one-liner: "Offline Support: Last-known weather snapshot in
    `localStorage` and Workbox cache keep the app usable when offline;
    amber/red banners indicate partial or fully cached data."
- **Local Storage** section:
  - Add `weather-last-known-v1` row with description.
  - Fix `theme-mode` values to `'light' | 'dark' | 'auto'`.
- **Performance**: remove "Single-cache strategy" line; replace with "Three
  tiers: `localStorage` (cold-start), React Query (in-memory), Workbox
  (cross-session offline)."
- **Caching diagram**: optional small ASCII block if it fits.

---

## 11. Risks

- **`weatherManager` consumers.** Existing tests assert return shape; the new
  `sources` field is additive but the `fallbackSource` re-purposing is
  semantic. Confirm no consumer branches on `'HKO'` literally — only the
  banner does.
- **localStorage write race.** Concurrent successful fetches (city switch
  mid-fetch) could clobber each other. Mitigation: include `cityId` in the
  envelope; `useSelectedCity` calls `clearLastKnownWeather()` synchronously
  before initiating a new fetch.
- **Workbox `urlPattern` function form.** `vite-plugin-pwa` exposes Workbox
  v7; function-form `urlPattern` works. Verify in dev before commit; fallback
  is two regex entries.
- **Schema migrations.** `v: 1` is hardcoded; any future change requires a
  bump and a drop on mismatch. No migration path needed at v1.
- **Initial paint flicker.** Cold load paints the snapshot instantly, then
  React Query may briefly re-render with `isLoading: true` if the query
  hasn't resolved. Use `placeholderData: keepPreviousData` plus
  `initialData` to suppress. Confirm with manual QA.
- **Banner copy in tc.** New translation strings need to be added in both
  languages; double-check tone matches existing `fallback.*` keys.

---

## 12. Sequencing

Order matters because some changes are type-level (touch `WeatherData`) and
must land before their consumers compile.

1. **Branch created.** `feat/caching-overhaul` (DONE).
2. **Types** — add `SourceId`, `SourceState`, `WeatherData.sources`. Existing
   code keeps compiling; new field is optional.
3. **Constants** — add new `TIMING.*` and `STORAGE_KEYS.LAST_KNOWN`. No
   consumers yet.
4. **Storage helpers** — `readLastKnownWeather` / `writeLastKnownWeather` /
   `clearLastKnownWeather`. Unit tests.
5. **Orchestrator** — populate `sources` on every return; emit `fallbackSource`
   per §6.2; call `writeLastKnownWeather` on success. Extend existing
   `weather-manager.test.ts`.
6. **Hook** — `useWeatherWithProgress` reads snapshot, sets `initialData`,
   uses new TTLs.
7. **useSelectedCity** — `clearLastKnownWeather()` on city switch.
8. **Banner component** — three branches. Add tests.
9. **Index page** — wire `WeatherBanners`. Remove `cacheLabel`.
10. **i18n** — add new keys to en + tc.
11. **Workbox** — extend `urlPattern` to cover `/hko-data/*`.
12. **Docs** — `ARCHITECTURE.md` (technical), `README.md` (high-level).
13. **Full test run + lint.** Fix any regressions. Iterate.
14. **Manual QA pass** per §9.

No commits during implementation per project rules. Branch push deferred
until user reviews.

---

## 13. Open questions

None blocking. Two minor:

- **Q1.** Should the red (offline) banner be sticky across city switches? My
  read: no — switching city implies intent; show whatever the new city's
  snapshot has (likely empty → loading).
- **Q2.** Should the snapshot also persist the *previous* `weather` query's
  meta (e.g. last `fetchedAt` per source) when sources are missing because
  the very first fetch failed? Current plan: skip; we only write on success.
  If the very first fetch ever fails, there's nothing to write, and the user
  sees the regular error UI. Acceptable trade-off; flagging for visibility.

---

## 14. Acceptance criteria

- All existing 133 tests pass.
- New tests added in §9 pass.
- `npm run lint` clean.
- Manual QA pass §9 covers all 6 scenarios.
- `ARCHITECTURE.md` and `README.md` reflect the new architecture and fix the
  three existing mismatches.
- No new dependencies in `package.json`.
- Branch `feat/caching-overhaul` is ready for review; no commits made.