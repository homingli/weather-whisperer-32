# Implementation Tasks: MSC Vancouver Nowcast

> Status: Approved
> Depends on: design.md

---

## Task Breakdown

### Task 1: Add MSC constants (`src/lib/constants.ts`) — done (2026-08-07, verified)

**Type:** Modify
**Estimate:** 0.5h
**File targets:** `src/lib/constants.ts`
**Dependencies:** none

Add MSC-specific constants:

```typescript
// STORAGE_KEYS: no new keys (tiles are HTTP-cached, no localStorage grid cache)

// MSC WMS / GeoMet
export const MSC = {
  WMS_URL: 'https://geo.weather.gc.ca/geomet',
  LAYER: 'HRDPS-WEonG_2.5km_TotalPrecipIntensityIndex',
  STYLE: 'TotalPrecipIntensityIndex_Dis',
  LEGEND_URL: 'https://geo.weather.gc.ca/geomet?service=WMS&request=GetLegendGraphic&version=1.3.0&sld_version=1.1.0&layer=HRDPS-WEonG_2.5km_TotalPrecipIntensityIndex&format=image/png&STYLE=TotalPrecipIntensityIndex_Dis',
} as const;

// Vancouver bounding box / center
export const VANCOUVER_BBOX = { north: 49.50, south: 48.90, west: -124.00, east: -122.30 } as const;
export const VANCOUVER_CENTER = [49.28, -123.12] as const;

// TIMING additions:
//   MSC_TIMEOUT_MS: 30000  (tile fetch timeout, same as NOWCAST_TIMEOUT_MS)
```

**Acceptance criteria:**
- File compiles with `npx tsc --noEmit`
- All existing imports still work

---

### Task 2: Create run/step-time derivation (`src/lib/msc-wms.ts`) — done (2026-08-07, verified)

**Type:** New file
**Estimate:** 1h
**File targets:** `src/lib/msc-wms.ts`
**Dependencies:** Task 1

Pure, testable helpers:

```typescript
// HRDPS runs at 00/06/12/18Z, published ~1-2h after run start. Latest
// published run start = floor((utcHour - 2) / 6) * 6, on the previous day
// when that goes negative. Verified 2026-08-07 at 00:54Z/01:23Z: the 18Z
// run was still latest while 00Z had not yet published.
export function determineLatestRun(now: Date): Date;

// Steps = runStart + 1h .. runStart + 6h (6 steps). ISO 8601 UTC strings.
// GeoMet TIME dimension starts at run+1h (no 0h step), nearestValue=0.
export function buildMscStepTimes(now: Date): { runStart: Date; steps: string[] };

// "19:00" — UTC HH:MM for step labels (mirrors HKO stepTimes display).
export function formatStepTime(iso: string): string;

// "2026-08-06 18:00" — UTC, for the control-bar observation time.
export function formatObservationTime(iso: string): string;
```

**Acceptance criteria:**
- `determineLatestRun` handles run boundaries (00:00Z, 00:30Z, 03:00Z, 06:00Z, 06:30Z, 12:00Z, 18:00Z, 23:00Z, day rollover)
- `buildMscStepTimes` returns exactly 6 steps, each +1h apart, starting at runStart+1h
- File compiles with `npx tsc --noEmit`

---

### Task 3: Add MSC WMS service-worker rule (`vite.config.ts`) — done (2026-08-07, verified)

**Type:** Modify
**Estimate:** 0.5h
**File targets:** `vite.config.ts`
**Dependencies:** none

In the `VitePWA` `workbox.runtimeCaching` array, add a rule for GeoMet tiles
(next to the existing `/hko-data/*` rules):

```typescript
{
  urlPattern: /^https:\/\/geo\.weather\.gc\.ca\/.*/i,
  handler: 'StaleWhileRevalidate',
  options: {
    cacheName: 'msc-tile-cache',
    expiration: { maxEntries: 200, maxAgeSeconds: 3600, purgeOnQuotaError: true },
    cacheableResponse: { statuses: [0, 200] },
  },
},
```

**Acceptance criteria:**
- `vite build` succeeds (workbox config is valid)
- Existing HKO/Open-Meteo rules unchanged

---

### Task 4: Create MSC rainfall map outer component (`src/components/MSCRainfallMap.tsx`) — done (2026-08-07, verified)

**Type:** New file
**Estimate:** 1h
**File targets:** `src/components/MSCRainfallMap.tsx`
**Dependencies:** Task 2

MSC data is small cached WMS tiles, so there is NO "Load Map" prompt (D-009) —
the map auto-loads when the section renders:
- `lazy(() => import('./MSCRainfallMapInner'))`
- Chunk error boundary (same class pattern, reload on failure)
- Card wrapper with `nowcast.title` header + `nowcast.stayOrGo` kicker
- `Suspense` fallback = loading shell

**Acceptance criteria:**
- Compiles with tsc
- Renders the inner map immediately (no prompt); lazy chunk loads on render
- Error boundary catches chunk load failures
- Props: `{ userLocation?: { latitude: number; longitude: number } }`

---

### Task 5: Create MSC rainfall map inner component (`src/components/MSCRainfallMapInner.tsx`) — done (2026-08-07, verified)

**Type:** New file
**Estimate:** 3h
**File targets:** `src/components/MSCRainfallMapInner.tsx`
**Dependencies:** Tasks 1, 2

Leaflet map + WMS layer + controls:

```tsx
// - MapContainer centered on VANCOUVER_CENTER, zoom 9/10, same viewport
//   minZoom behavior as HKO (1080px breakpoint)
// - Carto light/dark basemap TileLayer + toggle (same as HKO)
// - WMSTileLayer (react-leaflet) with params containing layers/style/
//   transparent/format/time; `time` = stepTimes[activeStepIndex];
//   params object recreated on step change (useMemo) so react-leaflet
//   calls setParams -> new TIME -> tiles refetch (HTTP-cached)
// - Step slider (6 steps, 1h-6h), play/pause autoplay on
//   RAINFALL_AUTOPLAY_MS, same UI as HKO map
// - Control bar: observation time (msc.updated / nowcast.updated),
//   basemap toggle, refresh button
// - Loading spinner + 10s slow-network chip; error overlay with retry on
//   first-load failure; stale pill on step-switch failure
// - Legend card: GeoMet GetLegendGraphic <img> + msc.legendTitle
// - No-precipitation chip: one-shot bbox GetMap probe for step 1; fully
//   transparent PNG -> msc.noPrecipitation
// - User location marker when provided
```

**Acceptance criteria:**
- Compiles with tsc
- Renders Leaflet map centered on Vancouver
- Step controls work (6 steps); autoplay cycles
- Basemap toggle works; legend renders
- Error overlay + retry on tile failure; stale pill on refetch failure
- `aria-label` on map, legend has alt description, slider is a native range input

---

### Task 6: Wire MSC into Index page (`src/pages/Index.tsx`) — done (2026-08-07, verified)

**Type:** Modify
**Estimate:** 1h
**File targets:** `src/pages/Index.tsx`
**Dependencies:** Tasks 4, 5

The map is gated by the existing `isInRainfallRegion(lat, lon)` at TWO sites
(desktop bottom row + mobile Swiper slide 3). Extend the gate at both sites:

```typescript
// gate: isInRainfallRegion(lat, lon) || isInVancouverBox(lat, lon)
// then: isInVancouverBox(lat, lon) ? <MSCRainfallMap .../> : <RainfallMap .../>
```

Add `MSCRainfallMap` lazy import next to the `RainfallMap` lazy import.

**Acceptance criteria:**
- Vancouver city → MSC map; PRD city → HKO map; other cities → no map (unchanged)
- No TypeScript errors; no visual regressions in HKO path

---

### Task 7: Add translations (`src/contexts/LanguageContext.tsx`) — done (2026-08-07, verified)

**Type:** Modify
**Estimate:** 0.5h
**File targets:** `src/contexts/LanguageContext.tsx`
**Dependencies:** Tasks 4, 5

Per D-006: step controls / loading / error reuse `nowcast.*`; add `msc.*` for
legend + MSC-specific strings:

```json
{
  "msc.legendTitle": "Precipitation intensity",
  "msc.noPrecipitation": "No precipitation in forecast",
  "msc.usingLastAnalysis": "Using last analysis at {time}",
  "msc.dataUnavailable": "MSC data unavailable"
}
```

(Plus matching Traditional Chinese values.)

**Acceptance criteria:**
- All `t('msc.*')` calls resolve; both en and tc have matching keys
- No missing translation warnings in dev

---

### Task 8: Unit tests for run/step derivation (`src/lib/msc-wms.test.ts`) — done (2026-08-07, verified)

**Type:** Test
**Estimate:** 1h
**File targets:** `src/lib/msc-wms.test.ts`
**Dependencies:** Task 2

```typescript
describe('determineLatestRun', () => {
  it('picks the latest published run at cycle boundaries');
  it('accounts for the ~2h publish lag at 00:00-01:00Z');
  it('rolls to the previous day before 02:00Z');
});

describe('buildMscStepTimes', () => {
  it('returns 6 steps starting at runStart+1h, spaced 1h apart');
  it('steps are valid ISO 8601 UTC strings');
});

describe('formatStepTime / formatObservationTime', () => {
  it('formats HH:MM and YYYY-MM-DD HH:MM in UTC');
});
```

**Acceptance criteria:**
- All tests pass
- Branch coverage > 80% for msc-wms.ts

---

### Task 9: Integration tests for the MSC map (`src/components/MSCRainfallMap.test.tsx`) — done (2026-08-07, verified)

**Type:** Test
**Estimate:** 2h
**File targets:** `src/components/MSCRainfallMap.test.tsx`
**Dependencies:** Tasks 4, 5, 7

Test with mocked tiles (jsdom can't render Leaflet tiles; stub the inner
chunk / tile events):

```typescript
describe('MSCRainfallMap', () => {
  it('renders "Load Map" prompt initially');
  it('renders map after tapping Load Map');
  it('shows error boundary UI on chunk load failure');
});

describe('MSCRainfallMapInner', () => {
  it('renders 6 step labels');
  it('autoplay cycles through all steps');
  it('basemap toggle works');
  it('legend renders the GetLegendGraphic image');
});
```

**Acceptance criteria:**
- All tests pass; no regressions in existing HKO tests

---

### Task 10: End-to-end verification — automated gates pass; manual browser E2E pending

**Type:** QA
**Estimate:** 1h
**File targets:** none (manual verification)
**Dependencies:** all tasks above

Manual checklist:

- [ ] App starts clean — no MSC components loaded unless on a Vancouver city
- [ ] Vancouver city shows the MSC "Load Map" prompt; PRD city shows HKO prompt
- [ ] Tapping Load Map renders the map with precipitation tiles from GeoMet
- [ ] Step slider shows 6 steps (1h-6h); autoplay cycles; basemap toggle works
- [ ] Legend shows the GeoMet intensity scale image
- [ ] No-precipitation chip appears when the region is dry
- [ ] Tiles render from cache on reload (HTTP 304 / SW)
- [ ] Error overlay + retry on tile failure; stale pill on background failure
- [ ] TypeScript compiles clean (`npx tsc --noEmit`)
- [ ] Tests pass (`npx vitest run`)
- [ ] No ESLint errors in new files
- [ ] HKO map unchanged (no regressions)

---

## Execution Order

```
Task 1 (constants) ──┬──► Task 2 (msc-wms) ──┬──► Task 8 (unit tests)
Task 3 (workbox) ────┤                       ├──► Task 4 (MSCRainfallMap) ──┬──► Task 5 (Inner) ──┬──► Task 9 (component tests)
                      └───────────────────────┴──► Task 7 (translations) ─────┴──► Task 6 (Index) ──┴──► Task 10 (E2E)
```

**Parallelizable groups:**
- Tasks 1, 3 can run in parallel (independent)
- Task 2 depends on 1
- Tasks 4, 7 depend on 2
- Task 5 depends on 4 (and 2)
- Task 6 depends on 4, 5
- Tasks 8, 9 depend on 2 / 5 respectively
- Task 10 depends on all

**Total estimated effort:** ~11 hours (down from ~15h — the GRIB2 parse
pipeline, cache module, and proxy task are deleted)
