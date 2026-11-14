// Color band thresholds for the HKO nowcast overlay. Extracted so the parser,
// the canvas layer, and the legend all resolve colors from the same source.

/** Cells with less rain than this are not drawn at all — sub-0.2 mm amounts
 *  are radar/model noise, so overlaying them read as rain where none falls.
 *  Enforced by the GeoJSON converter; the legend's first band starts at this
 *  floor. */
export const MIN_OVERLAY_MM = 0.2;

/**
 * Ordered rainfall palette. Index i pairs with RAINFALL_BANDS[i]. Shared by
 * the map's paint expression, the map legend and the hero's precipitation
 * bar so the same amount always reads as the same hue across surfaces. The
 * hero's chart bands sit one bucket above the map legend (its first band is
 * 0.5-2 mm vs the map's 0.2-0.5) and skip index 5 (#ff0844): the chart has
 * no 20-30 mm band, so its "> 30" jumps straight to index 6.
 */
export const RAINFALL_COLORS = [
  '#a0c4ff', // 0 — lightest
  '#4facfe',
  '#00f2fe',
  '#43e97b',
  '#f6d365',
  '#ff0844', // 5 — chart bands skip this slot
  '#9d0b0b', // 6 — heaviest
] as const;

export const RAINFALL_BANDS = [
  { max: 0.5, color: RAINFALL_COLORS[0], label: '0.2 - 0.5' },
  { max: 2, color: RAINFALL_COLORS[1], label: '0.5 - 2' },
  { max: 5, color: RAINFALL_COLORS[2], label: '2 - 5' },
  { max: 10, color: RAINFALL_COLORS[3], label: '5 - 10' },
  { max: 20, color: RAINFALL_COLORS[4], label: '10 - 20' },
  { max: 30, color: RAINFALL_COLORS[5], label: '20 - 30' },
  { max: Infinity, color: RAINFALL_COLORS[6], label: '> 30' },
] as const;
