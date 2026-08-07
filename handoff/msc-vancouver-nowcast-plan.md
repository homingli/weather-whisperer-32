# MSC GeoMet Nowcast Rainfall Map for Vancouver, BC

## Goal

Build a nowcast rainfall map for Vancouver, BC, Canada using MSC (Meteorological Service of Canada) GEOMAT data, following the same architectural pattern as the existing HKO Hong Kong implementation. The map shows short-range precipitation forecast (up to 6h) as an animated overlay on a Leaflet basemap.

---

## Viability Assessment

### ✅ VIABLE — with architectural adaptations

MSC does **not** publish a CSV nowcast product like HKO's `Gridded_rainfall_nowcast.csv`. MSC provides gridded precipitation data in **GRIB2** binary format via their Datamart. The HKO pattern (CSV → parse in-browser → build RainGrid → render) is achievable by replacing the CSV fetch with client-side GRIB2 parsing.

### MSC Data Source: HRDPS (High Resolution Deterministic Prediction System)

| Property | Value |
|-----------|-------|
| **Resolution** | 2.5km (~0.0225° lat/lon grid) |
| **Domain** | Continental Canada (covers Vancouver) |
| **Product** | `TPCPNINTSTI` — Total Precipitation Intensity Index (0–10 scale) |
| **Forecast range** | 000–048h (we cap at 006h) |
| **Refresh** | 4× daily (00Z, 06Z, 12Z, 18Z) |
| **File size** | ~1.6 MB GRIB2 |
| **Units** | Intensity index → map to rainfall bands |
| **Access** | `https://dd.weather.gc.ca/YYYYMMDD/model_hrdps/continental/2.5km/HH/HHS/` — public, no auth |

**Key distinction from HKO:** HKO's nowcast is radar extrapolation (current weather pushed forward). HRDPS is a **numerical weather prediction model** — it simulates atmospheric physics to forecast precipitation. Both serve the same user need (show what rain looks like coming) but come from different data sources.

### Key Differences: HKO vs MSC

| Aspect | HKO (Hong Kong) | MSC (Vancouver) |
|--------|----------------|-----------------|
| Data format | CSV (plain text) | GRIB2 (binary) |
| File size | ~2.7 MB | ~1.6 MB GRIB2 |
| Resolution | ~2km (121×121 grid) | 2.5km (~0.0225°) |
| Data type | Radar extrapolation nowcast | NWP model forecast |
| Forecast range | 4 steps (0–2h extrapolation) | 7 steps (0–6h forecast) |
| Units | mm (direct) | Intensity index 0–10 (needs band mapping) |
| Access | Public CSV URL | Datamart GRIB2 (public, no auth) |
| Bbox coverage | HKO: ~22.1–24.3°N, ~113.8–116.1°E | Vancouver: ~48.9–49.5°N, ~124.0–122.5°W |

---

## Plan

### Phase 1: Data Discovery & GRIB2 Parsing (1–2 days)

**1.1. Verify GRIB2 parsing in-browser with grib2js**
- Install `grib2js` (WebAssembly-based GRIB2 parser, ~300KB gz)
- Download a sample HRDPS GRIB2 file:
  ```
  https://dd.weather.gc.ca/today/model_hrdps/continental/2.5km/00/003/20260806T00Z_MSC_HRDPS-WEonG_TPCPNINTSTI_Sfc_RLatLon0.0225_PT003H.grib2
  ```
- Parse the TPCPNINTSTI layer, verify values map to expected precipitation
- Benchmark parse time on mobile (target: <2s on 4G)
- Verify the GRIB2 metadata provides lat/lon coordinates for each grid cell

**1.2. Confirm MSC Datamart access pattern**
- Files available at: `https://dd.weather.gc.ca/YYYYMMDD/model_hrdps/continental/2.5km/HH/HHS/`
  - `YYYYMMDD` = analysis date, `HH` = analysis hour, `HHS` = forecast step hour
- No authentication required
- **CORS check**: verify if `dd.weather.gc.ca` allows cross-origin fetch from the app domain. If CORS blocks browser fetch, implement minimal proxy at `/api/msc-nowcast?date=YYYYMMDD&hr=HH&step=HHS`
- File naming pattern:
  ```
  YYYYMMDDTHHZ_MSC_HRDPS-WEonG_{FIELD}_Sfc_RLatLon0.0225_PT{HH}H.grib2
  ```

**1.3. Define Vancouver bounding box**

HRDPS 2.5km grid (~0.0225° cells). To cover Vancouver metro + surrounding region with adequate padding:

```
Vancouver bounding box:
  North: 49.55°N   (Squamish area)
  South: 48.90°N   (South of Vancouver, into US)
  West:  124.00°W  (Pacific, west of Vancouver Island)
  East:  122.30°W  (Fraser Valley, Hope area)
  Size: ~1.3° lat × 1.7° lon ≈ 145km × 190km
```

Grid dimensions at 2.5km:
- ~65 rows × ~85 columns ≈ 5,525 cells (vs HKO's 14,641 cells at 2km)
- Smaller dataset than HKO, good for mobile performance

---

### Phase 2: Data Fetching Layer (1–2 days)

**2.1. Create `src/lib/msc-fetch.ts`**

Mirrors HKO's `fetchRainfallNowcast()` pattern but for GRIB2 data:

```typescript
// Fetch GRIB2 from Datamart (or proxy)
// Parse with grib2js/wasm
// Extract TPCPNINTSTI layer values within Vancouver bbox
// Return same { rows: CellRow[], updateTime: string } shape as HKO parser
// Serve to buildRainGrid() — same pipeline as HKO
```

Key functions:
- `fetchMSCNowcast(onProgress?, signal?)` — fetch + parse + extract, returns `NowcastResult`
- `parseGRIB2Layer(grib2Buffer)` → `{ latitudes, longitudes, stepHours, values }`
- `extractVancouverGrid(parsedData)` → `CellRow[]` (same shape as HKO parser)

**2.2. Create `src/lib/msc-types.ts`**

```typescript
interface MSCGRIB2Layer {
  name: string;        // "TPCPNINTSTI"
  stepHours: number[]; // [0, 1, 2, 3, 4, 5, 6]
  latitudes: number[]; // sorted ascending (south→north)
  longitudes: number[];// sorted ascending (west→east)
  values: Float32Array; // [stepCount * rows * cols], intensity index 0-10
}
```

**2.3. Intensity index → rainfall bands mapping**

HRDPS `TPCPNINTSTI` uses a 0–10 index scale. Map to existing `RAINFALL_BANDS`:

| Index | Description | Band mapping |
|-------|------------|--------------|
| 0 | No precip | hidden |
| 1 | Very light | < 0.5 mm/h |
| 2–3 | Light | 0.5–2 mm/h |
| 4–5 | Moderate | 2–5 mm/h |
| 6–7 | Heavy | 5–10 mm/h |
| 8–9 | Very heavy | 10–20 mm/h |
| 10 | Extreme | > 20 mm/h |

Implement `intensityToBand(index: number): number` to convert index → mm/h-equivalent value for `getRainfallColor()`.

**2.4. Bbox extraction**

Clip GRIB2 grid to Vancouver bbox:
- Identify which grid cells fall within the bounding box
- Build a sub-grid (rows × cols of cells that overlap the bbox)
- Preserve the HKO-compatible cell-center format for the renderer

---

### Phase 3: Frontend Integration (1–2 days)

**3.1. Create `src/components/MSCRainfallMap.tsx`**

Drop-in replacement for `RainfallMap.tsx`:
- Same lazy-chunk pattern (`lazy(() => import('./MSCRainfallMapInner'))`)
- Same error boundary for chunk load failures
- Same "Load Map" prompt UI
- Uses `msc-fetch.ts` instead of HKO's `/hko-data/` path
- Same localStorage cache pattern (15-min TTL)

**3.2. Create `src/components/MSCRainfallMapInner.tsx`**

Drop-in replacement for `RainfallMapInner.tsx`:
- Vancouver-centered viewport: `center: [49.28, -123.12]`
- Same step controls, autoplay, basemap toggle
- 7 forecast steps (0h, 1h, 2h, 3h, 4h, 5h, 6h)
- Uses same `RainGrid` type, same `RainfallCellsLayer`
- Same progress bar, slow-network chip, stale-data indicator
- Same error overlays

**3.3. Vancouver-specific defaults**

```typescript
const VANCOUVER_CENTER = [49.28, -123.12];
const VANCOUVER_ZOOM = 9;  // desktop, same as HKO
const MIN_ZOOM = 8;  // mobile, same as HKO
const MAX_ZOOM = 17;  // same as HKO
```

---

### Phase 4: Configuration & Routing (0.5 days)

**4.1. Region config**
- Add `msc` region alongside `hko` in the existing region system
- Vancouver location auto-detect → route to MSC nowcast
- HKO location → route to HKO nowcast (unchanged)
- Configurable: which region's nowcast to show when location is ambiguous

**4.2. Language support**
- Reuse existing `en/tc` translations (same `nowcast.*` keys as HKO)
- No separate translation namespace needed — `LanguageContext.t('nowcast.*')` works for both data sources

---

### Phase 5: Testing (1 day)

**5.1. Unit tests for GRIB2 parsing**
- Test sample HRDPS file parsing → verify grid shape
- Test intensity index → rainfall band mapping
- Test bbox clipping (only Vancouver cells)

**5.2. Integration tests**
- Test `MSCRainfallMap` renders with real Datamart data
- Test autoplay with 7 forecast steps
- Test caching (same TTL pattern as HKO)

---

## File Targets

| File | Action | Notes |
|------|--------|-------|
| `src/lib/msc-fetch.ts` | **CREATE** | GRIB2 fetch + grib2js parse + extract |
| `src/lib/msc-types.ts` | **CREATE** | MSC data types |
| `src/components/MSCRainfallMap.tsx` | **CREATE** | Outer map component (lazy chunk) |
| `src/components/MSCRainfallMapInner.tsx` | **CREATE** | Inner map component |
| `src/lib/rainfallBands.ts` | **MODIFY** | Add intensity index → mm/h mapping |
| `src/lib/constants.ts` | **MODIFY** | Add MSC nowcast config (bbox, zoom) |
| `grib2js` | **DEP** | npm package for browser GRIB2 parsing |

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| CORS blocks browser fetch from Datamart | **Medium** | Implement minimal `/api/msc-nowcast` proxy; or use WMS tile layer as fallback |
| grib2js wasm too heavy for mobile | **Low** | Lazy-load wasm only when map opened (same lazy pattern as Leaflet); chunk is ~300KB gz |
| Datamart file retention (30 days) | **Low** | Only need current day's data; files refresh daily |
| HRDPS rotated pole CRS (RLatLon) | **Low** | grib2js handles CRS; extract lat/lon values directly from GRIB2 metadata |
| TPCPNINTSTI intensity mapping accuracy | **Medium** | Calibrate bands against known precipitation amounts; document as "intensity index" not "mm/h" |

---

## Decision Summary

1. **Data source**: HRDPS (2.5km, 0–10 intensity index, 48h forecast, cap at 6h)
2. **Parsing**: Browser-side grib2js (WebAssembly), lazy-loaded with the map
3. **Intensity mapping**: Map 0–10 index to existing rainfall bands
4. **Forecast cap**: 6 hours (7 steps: 0h–6h, like HKO's 4 steps for 2h)
5. **Language**: Reuse existing `en/tc` (no separate `msc.*` keys)
6. **Bounding box**: ~48.9–49.5°N, ~124.0–122.5°W (Vancouver metro + surrounding region)
