# Technical Design: MSC Vancouver Nowcast Rainfall Map

> Status: Approved
> Depends on: requirements.md

## 1. Architecture Overview

The MSC nowcast renders **pre-rendered WMS tiles** from GeoMet. There is no GRIB2
fetching, no parsing, no WASM, no proxy (GeoMet sends `Access-Control-Allow-Origin:
*`), and no COOP/COEP requirement. The client is a Leaflet map with one WMS tile
layer whose `time` parameter switches per forecast step.

```
┌──────────────────────────────────────────────────────────────┐
│  UI Layer                                                     │
│  ┌──────────────┐   ┌───────────────────┐   ┌─────────────┐  │
│  │MSCRainfallMap│──▶│MSCRainfallMapInner │──▶│Leaflet Map   │  │
│  │(lazy chunk)  │   │(step controls,     │   │+ basemap     │  │
│  └──────────────┘   │ error/loading)     │   │+ WMS layer   │  │
│                     └───────────────────┘   └──────┬──────┘  │
├──────────────────────────────────────────────────────────────┤
│  Data Layer                                                   │
│  ┌──────────────────┐   ┌─────────────────────────────────┐  │
│  │msc-wms.ts        │──▶│ GeoMet WMS (geo.weather.gc.ca)  │  │
│  │(URL builder, run │   │ HRDPS-WEonG_2.5km_              │  │
│  │ + step times)    │   │ TotalPrecipIntensityIndex       │  │
│  └──────────────────┘   └─────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**Key principle:** the only new rendering code is a `WMSTileLayer` (react-leaflet,
already installed) with a per-step `time` param. No grid building, no
`RainfallCellsLayer` reuse — that component is HKO-specific (canvas cells).

## 2. Component Structure

### New files

| File | Purpose |
|------|---------|
| `src/lib/msc-wms.ts` | WMS URL/layer constants, latest-run + step-time derivation (pure, testable) |
| `src/components/MSCRainfallMap.tsx` | Outer component (lazy chunk, error boundary; auto-loads — no prompt, D-009) |
| `src/components/MSCRainfallMapInner.tsx` | Inner component (map, WMS layer, step controls, basemap toggle, states) |

### Modified files

| File | Change |
|------|--------|
| `src/pages/Index.tsx` | Add `isInVancouverBox` to the existing `isInRainfallRegion` gate at BOTH render sites (desktop + mobile swiper slide 3); Vancouver → `MSCRainfallMap`, else `RainfallMap` |
| `src/lib/constants.ts` | Add MSC constants (WMS URL, layer/style, bbox, center, step config, timeout) |
| `src/contexts/LanguageContext.tsx` | Add `msc.*` keys (en + tc) |
| `vite.config.ts` | Add workbox `runtimeCaching` rule for `geo.weather.gc.ca` |

### Removed from the original design

- `src/lib/msc-fetch.ts`, `src/lib/msc-types.ts`, `src/lib/msc-cache.ts` — no parse
  pipeline, no grid cache (tiles are HTTP-cached by GeoMet `max-age=3600` + SW).
- `pages/api/msc-nowcast.ts` proxy — not needed (CORS `*` on GeoMet) and this is a
  Vite SPA (no Next.js API routes).

## 3. GeoMet WMS Integration

**Endpoint:** `https://geo.weather.gc.ca/geomet`

**Layer (verified 2026-08-07):**
```
LAYERS=HRDPS-WEonG_2.5km_TotalPrecipIntensityIndex
STYLES=TotalPrecipIntensityIndex_Dis
```

**Request shape (react-leaflet `WMSTileLayer` builds this per tile):**
```
SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&
LAYERS=HRDPS-WEonG_2.5km_TotalPrecipIntensityIndex&
STYLES=TotalPrecipIntensityIndex_Dis&
CRS=EPSG:3857&FORMAT=image/png&TRANSPARENT=TRUE&
BBOX={x0},{y0},{x1},{y1}&WIDTH=256&HEIGHT=256&TIME={iso}
```

**Verified properties:**
- `Access-Control-Allow-Origin: *` — direct browser fetch.
- `Cache-Control: max-age=3600` — tiles cached 1h.
- **Rolling time window**: only hourly times from ~now-3h to ~now+48h are served.
  The GetCapabilities time dimension is CACHED and unreliable (it can claim a
  start earlier than what is actually served). Requesting an unserved hour
  returns an XML exception ("time outside valid hours") — the tile fails.
- **Strict time format**: `%Y-%m-%dT%H:%M:%SZ` exactly — no milliseconds.
  `toISOString()` output (`...T07:00:00.000Z`) is rejected with "Date format
  error" (verified 2026-08-07).
- **`version=1.3.0` is a REQUIRED param; `crs=EPSG:3857` must be in the final
  URL but NOT in the layer `params`.** Leaflet's TileLayer.WMS defaults to
  1.1.1 (which would map the CRS key to `srs` and be rejected — MapServer:
  "Missing required parameter CRS"); with `version=1.3.0`, TileLayer.WMS.onAdd
  appends `crs=EPSG:3857` itself from the map's CRS code. Passing `crs` as a
  param string is a Leaflet OPTION collision: it overrides `this.options.crs`
  and crashes `getTileUrl` with "crs.project is not a function" (verified
  2026-08-07, review issue 10).
- `nearestValue=0` on the TIME dimension means NO nearest-time snapping —
  unserved times hard-fail (no silent rounding).
- Works in EPSG:3857 (Leaflet default) and EPSG:4326.
- Transparent PNG where no precipitation (verified: 640×400 empty tile = fully
  transparent).

**Legend:** the style's discrete classes are rendered as compact swatches —
NOT the tall 217×482 `GetLegendGraphic` image (MapServer ignores scale params,
so the image cannot be shrunk). Colors and labels verified from GeoMet's legend
graphic + live tiles (2026-08-07): green `#2CE500` = Low, yellow `#FEFE00` =
Moderate, orange `#FE8000` = High (translations `msc.intensityLow/Moderate/High`;
WCAG 1.4.1 satisfied by the text labels).

## 4. Run Selection and Step Times (`src/lib/msc-wms.ts`)

GeoMet exposes no lightweight time-dimension endpoint (GetMetadata disabled; full
GetCapabilities is ~39 MB) and serves a rolling time window, so step times are
**derived from the UTC clock**: the observation/run time comes from a
conservative publish-lag rule, and the steps are the next 6 hourly times from
now (always inside the served window).

```
function determineLatestRun(now: Date): Date
  // HRDPS runs at 00/06/12/18Z, published ~1-2h after start.
  // Latest published run start R = floor((utcHour - 2) / 6) * 6 (UTC).
  // (Verified at 00:54Z and 01:23Z UTC on 2026-08-07: 18Z was still the
  //  latest run while the 00Z run was not yet published.)

function buildMscStepTimes(now: Date): { runStart: Date; steps: string[] }
  // steps = the NEXT 6 HOURS from now (next full hour + 0..5h), formatted in
  // MapServer's strict "YYYY-MM-DDTHH:00:00Z" (no milliseconds). NOT
  // runStart+1..6h: GeoMet serves a rolling ~now-3h..+48h window, so early
  // hours of the latest run are typically no longer served and would fail
  // with "time outside valid hours" (verified 2026-08-07).

function formatStepTime(iso: string): string  // "12:00" (Vancouver local HH:MM)
function formatObservationTime(iso: string): string  // "2026-08-06 11:00" (local)
function vancouverTimeZoneAbbr(iso?: string): string  // "PDT" / "PST"
```

**Display zone (user decision 2026-08-07):** WMS timestamps stay UTC instants
(the `time` param), but the UI renders them in Vancouver local time via Intl
(`America/Vancouver`, `hourCycle: 'h23'`) so DST (PDT/PST) is handled by the
engine, not hardcoded offsets. The step label and observation chip show the
zone abbreviation (`msc.legendTitle` area). Falls back to UTC if a target
lacks the tz database.

**Observation time (FR-010):** the computed run start `R`, formatted
`YYYY-MM-DD HH:mm` Vancouver local time, shown in the control bar
(`nowcast.updated`), with the zone abbreviation.

**Stale analysis (D-008):** if `now - R > 6h` (possible in the up-to-2h window
before the next run publishes), show the `msc.usingLastAnalysis` chip. With the
2h lag rule, the oldest displayed run is ~8h.

**Deterministic and testable:** pure functions of `now`; unit tests cover run
boundaries (00:00Z, 00:30Z, 03:00Z, 06:00Z, 06:30Z, 23:00Z, day rollover).

## 5. Component Behavior

### MSCRainfallMap.tsx (outer)

MSC data is small, cached WMS tiles — not the 2.7 MB HKO CSV — so there is NO
"Load Map" prompt (D-009; HKO keeps its prompt). The map auto-loads when the
section renders: lazy `import('./MSCRainfallMapInner')` + `Suspense` (loading
shell fallback) + error boundary (chunk load failures → reloadable error).

### MSCRainfallMapInner.tsx

- Leaflet `MapContainer` centered on `VANCOUVER_CENTER` [49.28, -123.12],
  zoom bounds per viewport like the HKO map, `preferCanvas` not needed (no
  cell rectangles).
- Basemap `TileLayer` (Carto light/dark) + toggle, same pattern as HKO.
- **WMS layer** for the active step:
  ```tsx
  <WMSTileLayer
    url={MSC_WMS_URL}
    params={useMemo(() => ({ layers, styles, transparent: 'TRUE', format: 'image/png', time: stepTimes[activeStepIndex] }), [stepTimes, activeStepIndex])}
    opacity={0.7}
  />
  ```
  react-leaflet calls `layer.setParams` when the `params` object identity
  changes → new TIME → tiles refetch (HTTP-cached, fast).
- Step controls + autoplay: identical UI to the HKO map (play/pause, range
  slider, step labels). Autoplay advances `activeStepIndex` on
  `RAINFALL_AUTOPLAY_MS`.
- User location marker (same icon, if `userLocation` provided).
- Loading: spinner while the first WMS tiles load (tile `load`/`tileerror`
  events → `isLoading`), then show map. Slow-network chip after 10s.
- Error: if the first tile request errors and no data is showing → error
  overlay with retry; if a background step switch fails → stale/retry pill.
- Legend: card with compact intensity swatches (Low/Moderate/High) + `msc.legendTitle`
  label + visually-hidden description.
- No-precipitation: a one-shot probe `GetMap` at bbox zoom for step 1; if the
  returned PNG is fully transparent → `msc.noPrecipitation` chip. (See §7.)

## 6. Caching and Service Worker

- GeoMet sets `Cache-Control: max-age=3600` on tiles; the browser cache serves
  revisits within an hour with zero requests.
- `vite.config.ts` PWA workbox: add a `runtimeCaching` rule matching
  `^https://geo\.weather\.gc\.ca/.*` with `StaleWhileRevalidate`,
  `maxEntries` bounded (~200), `maxAgeSeconds: 3600`, `purgeOnQuotaError: true`
  (tiles are small PNGs; 200 × ~5 KB ≈ 1 MB worst case).
- No localStorage cache module; FR-006 is satisfied by HTTP + SW caching.

## 7. Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Run not yet published (00:00–02:00Z window) | `determineLatestRun` lag rule selects the previous run; labels match served data; `msc.usingLastAnalysis` chip when > 6h old |
| No precipitation in the region | Probe tile for step 1 is fully transparent → `msc.noPrecipitation` chip over the map (map still rendered) |
| Tile fetch fails (network/CORS regression) | Error overlay with retry (first load) or stale pill (step switch) |
| GeoMet outage | Tiles fail → error overlay; cached tiles from SW still render if previously loaded |
| User pans outside Vancouver bbox | No panning restriction; tiles just render wherever the map shows |
| Dark theme | Same basemap toggle pattern as HKO |
| Screen reader | Map `aria-label`; legend image has `alt` description; step controls use native `<input type="range">` + buttons with `aria-current` |
| Transparent-vs-empty ambiguity | Probe-tile transparency check distinguishes "no rain" from "not loaded" only after step-1 tiles load successfully |

## 8. Performance Budgets

| Metric | Target | HKO Baseline |
|--------|--------|--------------|
| Initial tile load (6 steps × ~6 tiles at z10) | < 5 s on 4G (each tile ~2-10 KB) | < 30 s (2.7 MB CSV) |
| Step change | ~instant after first pass (HTTP cache); first pass < 1 s | < 100 ms |
| Memory | minimal (no grid, no WASM) | ~30 MB (grid + Leaflet) |
| Total time to map ready | < 10 s on 4G | < 30 s |

No WASM bundle, no parse pipeline, no proxy. Strictly lighter than the HKO map.

## 9. Dependencies

**No new runtime dependencies.** `react-leaflet` (WMSTileLayer) and `leaflet`
are already installed. Task 1 of the original design (install a GRIB2 parser) is
deleted.

## 10. Verification Strategy

- Unit tests: `src/lib/msc-wms.test.ts` — `determineLatestRun` boundaries,
  `buildMscStepTimes` (6 steps, +1h..+6h, day rollover), `formatStepTime`,
  `formatObservationTime`.
- Component tests: `src/components/MSCRainfallMap.test.tsx` — "Load Map" prompt,
  lazy chunk rendering, step slider (6 steps), autoplay cycles, basemap toggle,
  legend renders, error overlay on tile failure (mock `fetch`/tile events).
- E2E (manual): real GeoMet requests render tiles; steps switch; no-precip
  chip; SW rule caches tiles; HKO map unchanged.

## 11. Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| GeoMet TIME semantics change (dimension start, nearestValue) | Labels derive from the same computed run; probe tile sanity-checked at runtime |
| GeoMet rate limits / outage | 1h HTTP cache + SW cache; error overlay; retry |
| Transparent PNG probe flakiness | Probe only gates a non-blocking chip, never the map itself |
| run-lag rule wrong by an hour at boundaries | `nearestValue=0` snaps to the nearest available hour; labels remain internally consistent |
