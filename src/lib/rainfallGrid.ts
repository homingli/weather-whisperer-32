// Rainfall grid: dense Float32Array representation of the HKO nowcast grid.
//
// Replaces the previous GeoJSON FeatureCollection per color band + turf.union
// pipeline. The grid is rectangular with cells observed from the source data;
// cellLats/cellLons carry the actual lat/lon of each row/col, so the renderer
// can paint at the real geographic positions even when HKO varies its spacing.
// Cells with value <= 0 are stored as 0 and skipped at paint time. Active
// step is a single mutable index into the values array — no merge step, no
// GeoJSON serialization, no synchronous geometry operations on the slider
// hot path.
//
// The grid is built from OBSERVED lat/lon values, not from an assumed cell
// size. A previous version used CELL_DLAT=0.009 / CELL_DLON=0.0095, which
// was half the actual HKO spacing (~0.018 / ~0.0195). The result was a
// grid of 241×247 cells where only every other row/col was ever filled,
// and the canvas drawRect with the wrong (negative) height produced a blank
// or wildly misaligned overlay. The current build snaps each row/col to
// the nearest observed cell center; row 0..120 and col 0..120 are exactly
// 121×121 = 14,641 cells per step.

import { getRainfallColor } from './rainfallBands';

/**
 * Snap radius (in degrees) when matching an incoming (lat, lon) to a stored
 * row/col. HKO publishes cell centers to 3 decimals (~111 m), so 0.5× the
 * typical cell spacing (~0.009) is a generous match window.
 */
const SNAP_RADIUS_DEG = 0.01;

export interface RainGrid {
  /** Number of rows (lat bands). */
  rows: number;
  /** Number of cols (lon bands). */
  cols: number;
  /** Cell-center latitude per row, south→north. Length === rows. */
  cellLats: Float64Array;
  /** Cell-center longitude per col, west→east. Length === cols. */
  cellLons: Float64Array;
  /** Number of forecast steps (each step has rows*cols values). */
  stepCount: number;
  /** Human-readable "HH:MM" per step. Length === stepCount. */
  stepTimes: string[];
  /** values[step * rows * cols + row * cols + col] = mm (0 = no rain). */
  values: Float32Array;
  /** Mutable active step index; controlled by the React component. */
  activeStep: number;
}

/** Pure: parse rows then derive a grid from the observed lat/lon values. */
export function buildRainGrid(rows: CellRow[]): RainGrid | null {
  if (rows.length === 0) return null;

  // Pass 1: collect unique lat values, unique lon values, and unique steps.
  // We keep a Set during collection then sort once at the end. lat/lon
  // appear in arbitrary order in the source CSV (the HKO feed walks
  // west→east by row, but we don't rely on that), so a sort is required.
  const latSet = new Set<number>();
  const lonSet = new Set<number>();
  const stepOrder: string[] = [];
  const stepIndex = new Map<string, number>();
  const stepTimes: string[] = [];

  for (const r of rows) {
    if (r.value <= 0) continue;
    latSet.add(r.lat);
    lonSet.add(r.lon);
    if (!stepIndex.has(r.endTime)) {
      stepIndex.set(r.endTime, stepOrder.length);
      stepOrder.push(r.endTime);
      stepTimes.push(formatHHMM(r.endTime));
    }
  }

  if (stepOrder.length === 0) return null;
  if (latSet.size === 0 || lonSet.size === 0) return null;

  // Sort lat south→north (ascending) and lon west→east (ascending).
  const cellLats = Float64Array.from(latSet).sort();
  const cellLons = Float64Array.from(lonSet).sort();
  const rowsCount = cellLats.length;
  const colsCount = cellLons.length;
  const stepCount = stepOrder.length;
  const values = new Float32Array(rowsCount * colsCount * stepCount);

  // Build O(1) snap lookups. The maps key on a quantized form of the lat/lon
  // (3-decimal precision matches HKO's published precision) and store the
  // observed row/col index. Two maps per axis handle the rounding direction
  // in case the parser sees a slightly-different float representation than
  // what was used to build cellLats; the renderer falls back to nearest-
  // neighbor search on a miss.
  const latKey = (v: number) => Math.round(v * 1000); // ~0.001° = ~111 m
  const lonKey = (v: number) => Math.round(v * 1000);
  const latLookup = new Map<number, number>();
  const lonLookup = new Map<number, number>();
  for (let r = 0; r < rowsCount; r++) latLookup.set(latKey(cellLats[r]), r);
  for (let c = 0; c < colsCount; c++) lonLookup.set(lonKey(cellLons[c]), c);

  // Pass 2: fill the grid. Each cell snaps to its grid index by exact key
  // match first, then by nearest-neighbor within SNAP_RADIUS_DEG. We don't
  // expect misses for real HKO data, but the fallback keeps the parser
  // resilient if HKO tweaks precision in the future.
  for (const r of rows) {
    if (r.value <= 0) continue;
    const si = stepIndex.get(r.endTime)!;
    let ri = latLookup.get(latKey(r.lat));
    let ci = lonLookup.get(lonKey(r.lon));
    if (ri === undefined) ri = nearestIndex(cellLats, r.lat);
    if (ci === undefined) ci = nearestIndex(cellLons, r.lon);
    if (ri < 0 || ri >= rowsCount || ci < 0 || ci >= colsCount) continue;
    values[si * rowsCount * colsCount + ri * colsCount + ci] = r.value;
  }

  return {
    rows: rowsCount,
    cols: colsCount,
    cellLats,
    cellLons,
    stepCount,
    stepTimes,
    values,
    activeStep: 0,
  };
}

/**
 * Find the index in `arr` (sorted ascending) whose value is closest to
 * `target`. Returns -1 if the closest match is outside SNAP_RADIUS_DEG.
 * Binary search; O(log n). Used as a fallback when the lat/lon key
 * lookup misses (e.g. parser saw a slightly-different float form).
 */
function nearestIndex(arr: Float64Array, target: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  // lo is the first index >= target. Compare with lo-1.
  const cand1 = arr[lo];
  const cand2 = lo > 0 ? arr[lo - 1] : Infinity;
  const best = Math.abs(cand1 - target) <= Math.abs(cand2 - target) ? lo : lo - 1;
  return Math.abs(arr[best] - target) <= SNAP_RADIUS_DEG ? best : -1;
}

export interface CellRow {
  endTime: string;
  lat: number;
  lon: number;
  value: number;
}

export function formatHHMM(endTime: string): string {
  if (endTime.length >= 12) {
    return `${endTime.substring(8, 10)}:${endTime.substring(10, 12)}`;
  }
  return endTime;
}

// Parse the HKO update-time field from the first row's first column.
// Format: "YYYYMMDDHHmm" (e.g. "202605171600"). Returns "" if not parseable.
export function parseUpdateTime(field: string): string {
  if (!field || field.length < 12) return '';
  return `${field.substring(0, 4)}-${field.substring(4, 6)}-${field.substring(6, 8)} ${field.substring(8, 10)}:${field.substring(10, 12)}`;
}

// Parse the CSV text into a flat row list. Single pass, no allocations beyond
// the result array. Rows with value <= 0 are filtered here so the grid builder
// doesn't have to skip them again. PapaParse is used in fetchRainfallGrid
// for streaming; this function is the synchronous fallback kept for tests.
export function parseRainfallCSVText(csvText: string): {
  rows: CellRow[];
  updateTime: string;
} {
  const lines = csvText.split('\n');
  const rows: CellRow[] = [];
  let updateTime = '';
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const parts = line.split(',');
    if (parts.length < 5) continue;
    const value = parseFloat(parts[4]);
    if (Number.isNaN(value) || value <= 0) continue;
    const lat = parseFloat(parts[2]);
    const lon = parseFloat(parts[3]);
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    const endTime = parts[1];
    if (!endTime) continue;
    if (!updateTime && parts[0] && parts[0].length >= 12) {
      updateTime = parseUpdateTime(parts[0]);
    }
    rows.push({ endTime, lat, lon, value });
  }
  return { rows, updateTime };
}

// Resolve the color hex string for a given mm value. Re-exported from
// rainfallBands so the parser and the canvas layer share the source of truth.
export { getRainfallColor };
