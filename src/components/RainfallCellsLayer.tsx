// Renders the HKO nowcast grid as a set of L.Rectangle paths inside
// Leaflet's canvas renderer. Each cell becomes one Rectangle whose bounds
// are derived from the observed cell-center lats/lons (midpoints between
// adjacent cells). The Rectangle's fill color is driven by the cell's
// value at the active step.
//
// Why paths, not a custom canvas:
// - Leaflet's Renderer._updateTransform handles zoom animation natively
//   (it sets the same CSS scale + translate that GridLayer uses for tiles).
//   The renderer container has class `leaflet-zoom-animated` and lives
//   in `mapPane`, so the overlay scales smoothly with the basemap during
//   pinch / wheel / button zoom \u2014 no manual transform management.
// - Pan already worked via the overlayPane transform; that still works.
// - `L.canvas()` renderer batches every path into a single canvas, so
//   ~10k cells = 1 canvas element + 10k lightweight path objects (no
//   per-cell DOM cost, unlike the SVG-renderer era).

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { RainGrid } from '@/lib/rainfallGrid';
import { getRainfallColor, RAINFALL_BANDS } from '@/lib/rainfallBands';

/**
 * Per-cell rectangle handle keyed by flatIndex (row * cols + col). The
 * flatIndex is stable across refetches because the HKO grid shape
 * (rows, cols, cellLats, cellLons) is fixed; only the values change.
 * Keying by flatIndex lets the sync effect add/remove layers
 * incrementally on refetch instead of tearing down and rebuilding all
 * ~10k rectangles every 6 minutes.
 */
type LayerMap = Map<number, L.Rectangle>;

/**
 * Alpha for the rainfall overlay. Baked into the rgba fillColor string so
 * fillOpacity stays at 1 — using fillOpacity < 1 in Leaflet's canvas
 * renderer can produce scan-line banding where adjacent cells overlap
 * during the zoom animation.
 */
const OVERLAY_ALPHA = 0.5;

/** Convert a hex color (#rrggbb) to rgba(r, g, b, a) for canvas blending. */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Compute the geographic bounds for a given cell. The cell's center is at
 * (cellLats[r], cellLons[c]); the bounds are midpoints with adjacent cells
 * so adjacent cells share boundaries and there's no gap between them.
 *
 * For the southernmost / westernmost cells, fall back to the same half-cell
 * spacing HKO uses (0.009° lat, 0.0095° lon) when no neighbor exists.
 */
function cellBounds(grid: RainGrid, r: number, c: number): L.LatLngBoundsExpression {
  const cellLat = grid.cellLats[r];
  const cellLon = grid.cellLons[c];
  const halfLatSouth = r > 0
    ? (grid.cellLats[r - 1] + cellLat) / 2
    : cellLat - 0.009;
  const halfLatNorth = r < grid.rows - 1
    ? (cellLat + grid.cellLats[r + 1]) / 2
    : cellLat + 0.009;
  const halfLonWest = c > 0
    ? (grid.cellLons[c - 1] + cellLon) / 2
    : cellLon - 0.0095;
  const halfLonEast = c < grid.cols - 1
    ? (cellLon + grid.cellLons[c + 1]) / 2
    : cellLon + 0.0095;
  return [
    [halfLatSouth, halfLonWest],
    [halfLatNorth, halfLonEast],
  ];
}

/** Default style for a visible rainfall cell. */
const VISIBLE_STYLE: L.PathOptions = {
  stroke: false,
  // `fill: true` must be explicit: L.setStyle MERGES into existing options
  // (see Leaflet Path.setStyle at leaflet-src.js:8199). After we hide a cell
  // by setting `fill: false`, a subsequent setStyle({ fillColor: ... }) call
  // would leave `fill: false` in place — the cell would stay hidden even
  // though its color updated. Same for opacity/fillOpacity: explicit values
  // are required to override the previously-hidden state.
  fill: true,
  fillOpacity: 1,
  opacity: 1,
  lineCap: 'round',
  lineJoin: 'round',
};

/** Style for a hidden cell (zero at the active step). */
const HIDDEN_STYLE: L.PathOptions = {
  stroke: false,
  fill: false,
  fillOpacity: 0,
  opacity: 0,
};

/**
 * Layer component: incrementally syncs per-cell Rectangles with the
 * grid, then updates their fill colors when the active step changes.
 * The MapContainer is configured with `preferCanvas={true}` so all
 * Rectangles render to a single shared canvas with native zoom
 * animation.
 *
 * Sync model: rectangles are keyed by flatIndex (row * cols + col),
 * which is stable across refetches because the HKO grid shape stays
 * fixed. On refetch, cells that newly have rain at any step get a
 * fresh Rectangle; cells that no longer have rain at any step get
 * removed; existing cells stay in place. Only when grid.shape changes
 * (rows, cols, or cellLats/cellLons identity) do we do a full rebuild
 * — for real HKO data that path doesn't fire.
 */
export const RainfallCellsLayer = ({
  grid,
  activeStep,
}: {
  grid: RainGrid;
  activeStep: number;
}) => {
  const map = useMap();
  const layersRef = useRef<LayerMap>(new Map());
  // Track the grid shape so we only do a full rebuild when the
  // shape changes (rows/cols/lat/lon identity), not on every refetch.
  const shapeRef = useRef<string>('');

  // Cleanup: remove every rectangle when the map (or the component) is
  // torn down. This effect only fires on map unmount; refetches reuse
  // existing rectangles via the sync effect below. The `layers` and
  // `shape` references are captured at effect creation; they point to
  // the same Map and ref we use throughout the component's lifetime
  // (we never reassign `layersRef.current`), so the cleanup sees
  // whatever the sync effect last added.
  useEffect(() => {
    const layers = layersRef.current;
    const shape = shapeRef;
    return () => {
      for (const rect of layers.values()) rect.remove();
      layers.clear();
      shape.current = '';
    };
  }, [map]);

  // Sync rectangles with the grid. On the first run after mount we
  // create every cell that has rain at any step. On subsequent runs
  // (refetches) we add cells that newly have rain and remove cells
  // that no longer do. If the grid shape changes (rows/cols/lat/lon
  // identity), we tear down and rebuild from scratch.
  useEffect(() => {
    if (!map) return;
    const layers = layersRef.current;
    const { rows, cols, values, stepCount } = grid;
    const shapeKey = `${rows}/${cols}/${grid.cellLats.length}/${grid.cellLons.length}`;
    const shapeChanged = shapeRef.current !== shapeKey;
    if (shapeChanged) {
      // Grid shape changed — full rebuild.
      for (const rect of layers.values()) rect.remove();
      layers.clear();
      shapeRef.current = shapeKey;
    }

    // Walk the grid and add rectangles for cells that have rain at any
    // step. Skip cells that are zero for every step (no path needed).
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const flatIndex = r * cols + c;
        let hasRain = false;
        for (let s = 0; s < stepCount; s++) {
          if (values[s * rows * cols + flatIndex] > 0) {
            hasRain = true;
            break;
          }
        }
        if (hasRain) {
          if (!layers.has(flatIndex)) {
            const rect = L.rectangle(cellBounds(grid, r, c), {
              ...VISIBLE_STYLE,
              fillColor: '#000000', // overwritten on first activeStep update
            });
            rect.addTo(map);
            layers.set(flatIndex, rect);
          }
        } else {
          if (layers.has(flatIndex)) {
            const rect = layers.get(flatIndex)!;
            rect.remove();
            layers.delete(flatIndex);
          }
        }
      }
    }
  }, [map, grid]);

  // Update each cell's style based on its value at the active step.
  // Cells with value <= 0 are hidden; otherwise their fillColor is
  // resolved via the rainfall bands (alpha baked into the color).
  useEffect(() => {
    const layers = layersRef.current;
    if (layers.size === 0) return;
    if (activeStep < 0 || activeStep >= grid.stepCount) return;
    const { rows, cols, values } = grid;
    const stepOffset = activeStep * rows * cols;
    for (const [flatIndex, rect] of layers) {
      const v = values[stepOffset + flatIndex];
      if (v <= 0) {
        rect.setStyle(HIDDEN_STYLE);
      } else {
        rect.setStyle({
          ...VISIBLE_STYLE,
          fillColor: withAlpha(getRainfallColor(v), OVERLAY_ALPHA),
        });
      }
    }
  }, [grid, activeStep]);

  return null;
};

// Re-export RAINFALL_BANDS so existing imports keep working.
export { RAINFALL_BANDS };
