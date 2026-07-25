# Rainfall map: canvas renderer + typed-array grid

Branch: `perf/rainfall-canvas-grid`
Date: 2026-07-25 (plan); updated 2026-07-26 (post-implementation)
Status: implemented; see "Decision changes" below for divergences from the
original plan

## Decision changes from plan

The original plan was written before the implementation. Several decisions
changed during implementation; the implementation is the source of truth
and the rest of this doc should be read as historical context. Key changes:

- **Renderer is `preferCanvas` on `MapContainer`, not a custom pane.**
  `MapContainer` is configured with `preferCanvas={true}`, which routes
  every `L.Path` through `L.canvas()` automatically. We don't subclass
  `L.Layer`. The plan's custom-canvas-pane approach (with manual
  `requestAnimationFrame` redraw scheduling and `moveend`/`zoomend` hooks)
  was rejected: `L.canvas()` already does all of that and we get
  `Renderer._updateTransform`'s native zoom animation for free.
- **Per-cell `L.Rectangle` instead of one canvas + `fillRect`.** The
  original plan sketched a hand-rolled canvas-paint loop. The
  implementation creates one `L.Rectangle` per non-zero cell (via
  `L.canvas()` renderer), which gives us Leaflet's built-in zoom
  transform and lets us skip the per-step `fillRect` call entirely.
- **Grid model: `cellLats`/`cellLons` (Float64Array), not `minLat`/
  `dLat`/`dLon` constants.** The plan assumed constant HKO spacing of
  0.009 / 0.0095; the implementation instead captures the actual
  observed cell-center lat/lon per row/col, so the grid is correct even
  if HKO varies its resolution. `stepStarts: Uint16Array` was
  replaced by stride indexing (`values[step * rows * cols + ...]`).
- **No `activeStep` field on `RainGrid`.** The plan had it; the
  implementation keeps the grid fully immutable and passes
  `activeStep` as a prop on the React layer.
- **No PapaParse.** The plan originally listed `papaparse` as a
  dependency; the manual parser won (fixed-schema 5-column CSV, no
  quoting, already in memory by the time we parse). No new npm
  dep.
- **Incremental sync on refetch.** The plan did not anticipate that
  refetch (every ~30 min) would tear down 10k rectangles. The
  implementation keys rectangles by `flatIndex` and adds/removes only
  diffs. See `RainfallCellsLayer.tsx` for details.
- **Color cache per cell.** Each rectangle remembers its last applied
  rgba string; `setStyle` is skipped for cells whose color at the
  new step matches. Cheap on canvas renderer, but architecturally
  mirrors the incremental diff approach used for refetch.

## Problem

Mobile slider drag on the nowcast map stutters. Two main-thread
operations fire on every step transition:

1. `turf.union` runs synchronously per step to merge ~500–2000 raw
   cells into 6 color-band polygons (`RainfallMapInner.tsx:423`).
   Blocks JS for ~30–100 ms on a mid-range phone.
2. `clearLayers()` + `addData()` in `ColorGeoLayer` allocates ~6
   SVG `<path>` elements per color band per step (`RainfallMapInner.tsx:140`).
   SVG reflow on mobile is ~5–10× more expensive than canvas paint.

Earlier perf switch (`09f64b1` "perf(RainfallMap): replace per-cell
Rectangles with color-bucketed GeoJSON") was correct at the time
because it collapsed ~500 nodes to ~6. Today's bottleneck is
different: not node count, but sync main-thread work + SVG reflow.

## Goals

1. Mobile slider drag sustains 60 fps on a Pixel 5 / iPhone 12 baseline.
2. No regression in desktop behavior or visual appearance.
3. Remove `@turf/union` from the hot path.
4. Keep WCAG plan compatible — phase 4 issue #8 (Leaflet `role="application"`
   removal + keyboard pan/zoom) still applies.

## Non-goals

- No change to legend, basemap toggle, autoplay cadence, or step controls.
- No change to CSV schema or HKO fetch logic.
- No change to memory or parser API for non-rainfall consumers.

## Lever 1: Leaflet canvas renderer (low effort, big win)

Change `renderer: L.svg()` → `renderer: L.canvas()` at
`RainfallMapInner.tsx:133`. Same data model (GeoJSON FeatureCollection),
same `clearLayers`/`addData` pattern, same tests pass (tests assert on
`data-testid`, not the DOM).

Wins:
- No DOM node allocation per polygon per step.
- Mobile paint cost drops from ~16 ms/frame to ~3 ms/frame at 6 paths.
- Zero risk — one-line change, existing test suite covers it.

Cost:
- Canvas doesn't scale on zoom the way SVG does. Mitigated by Leaflet's
  built-in `L.canvas()` re-render on `move`/`zoom`, and by the fact
  that each color-band polygon is already one merged shape (no per-cell
  detail to blur).

## Lever 2: Float32Array grid + direct canvas paint (medium effort)

Replace the data model entirely.

### Current model

```ts
cellsByColor: Map<string, FeatureCollection>
// union() collapses N features per color into 1-2 polygons per color band
// L.geoJSON paints 6 paths per step
```

### Target model

```ts
interface RainGrid {
  rows: number;        // ~244 (lat 21.30 → 23.50 / 0.009)
  cols: number;        // ~274 (lon 112.95 → 115.55 / 0.0095)
  minLat: number; minLon: number;
  dLat: number; dLon: number;       // 0.009, 0.0095 today
  stepCount: number;                // ~6
  stepStarts: Uint16Array;          // step index → start offset in `values`
  values: Float32Array;             // values[i] = mm at (row, col) for active step
  activeStep: number;
}
```

Cells with `value <= 0` are skipped (matches current parser behavior).
Cells of the same color band tile visually on canvas — no merge step
needed, no `turf.union` call.

### Renderer

Replace `ColorGeoLayer` with a custom `L.Layer` subclass registered
on a canvas pane. On `stepchange`, swap `activeStep`. On `moveend`/
`zoomend`, schedule a redraw via `requestAnimationFrame`. On `draw`:

```ts
for each cell where values[activeStep * rows * cols + i] > 0:
  const center = gridToLatLng(i);
  const a = map.latLngToLayerPoint(center);
  const b = map.latLngToLayerPoint([
    center.lat + dLat, center.lng + dLon
  ]);
  ctx.fillStyle = colorFor(values[i]);
  ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
```

Optional: viewport culling against `map.getBounds()` typically cuts
fillRect calls by ~95% at zoom 12.

### Parser

Use the existing manual parser (already in `src/components/RainfallMapInner.tsx`,
factored out to `src/lib/rainfallGrid.ts`). PapaParse was considered but
rejected: the CSV is fixed-schema (5 columns, comma-separated, no quoting),
the entire string is already in memory by the time we parse, and the
manual parser avoids the ~50KB PapaParse bundle cost for no measurable
parsing-speed win. The plan doc originally mentioned PapaParse — that
recommendation was superseded; the manual parser is the final choice.

### Dep removal

- `@turf/union@7.3.5` removed from `package.json` (commit: pending).
- `pnpm-lock.yaml` regenerated with `pnpm install --lockfile-only --ignore-scripts`.
- The dep-chain @turf/union pulled in (49 lines of lockfile) is also gone.

## Files to touch

- `src/components/RainfallMapInner.tsx` — bulk of the change.
  - `parseRainfallCSV` → return `RainGrid` instead of `NowcastResult`.
  - `ColorGeoLayer` → new `GridCanvasLayer`.
  - `MapContainer` children: drop `ColorGeoLayer`, add `<GridCanvasLayer grid={...} />`.
- `src/components/RainfallMap.test.tsx` — assertions change from
  `data-feature-count` per color band to grid shape and color counts.
- `package.json` — add `papaparse` (exact-pinned, `--ignore-scripts`),
  remove `@turf/union`.

## Tests

Existing 152 + 3 rainfall tests must continue to pass. New tests:
- Grid parser produces correct `rows`/`cols`/`stepCount` from a
  synthetic CSV.
- Cell at (lat, lon) with value 0 is excluded from `values`.
- Color band membership matches current `getRainfallColor`.
- Viewport culling: a step with cells outside `map.getBounds()` paints
  no fillRect calls for them.

Manual perf check: Chrome devtools, "6× CPU slowdown" + "Slow 4G",
drag slider on mobile breakpoint. Target: 60 fps sustained, no
main-thread long tasks > 50 ms.

## Acceptance

- [ ] `L.canvas()` is the only renderer used by `ColorGeoLayer` /
      `GridCanvasLayer`.
- [ ] No import of `@turf/union` anywhere in `src/`.
- [ ] `package.json` has no `@turf/union`; `papaparse` exact-pinned.
- [ ] Mobile slider drag: no stutter on Pixel 5 baseline.
- [ ] Desktop visual: identical to current (`725dc66` baseline).
- [ ] Legend, basemap toggle, refresh, autoplay all work unchanged.
- [ ] WCAG phase 4 issue #8 not regressed.
- [ ] All 152 tests + new grid tests pass.

## Risk

- Canvas DPR: must set `canvas.width = w * devicePixelRatio` to stay
  crisp on iOS retina. Leaflet's `L.canvas()` handles this when used
  directly; we'll need the same treatment for the custom pane.
- Redraw scheduling: must use `requestAnimationFrame` and a dirty
  flag, not redraw on every `move` event (which fires many times
  during a pan).
- Memory: `Float32Array(steps × rows × cols × 4 bytes)` for the full
  grid is ~3.2 MB max. Active step is a single Float32Array slice of
  ~270 KB. Fine.

## Out of scope (deferred)

- WCAG phase 4: Leaflet `role="application"` removal + keyboard
  pan/zoom (issue #8 in `handoff/ada-compliance-plan.md`).
- Reducing the `dLat`/`dLon` grid resolution — HKO controls this.
- Replacing the CSV endpoint with a binary format.

## References

- Leaflet canvas renderer: https://leafletjs.com/reference.html#canvas
- PapaParse streaming: https://www.papaparse.com/docs#streaming
- WCAG plan: `handoff/ada-compliance-plan.md`
- Recent commits: `d73a47d` (PR #61), `725dc66`, `09f64b1`