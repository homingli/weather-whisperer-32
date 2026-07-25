// Tests for RainfallCellsLayer. Verifies the cell rectangle count, the
// active-step fill-color resolution, and the incremental sync behavior
// on refetch. Mocks leaflet so the tests run in jsdom without a real map.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { RainfallCellsLayer } from './RainfallCellsLayer';
import type { RainGrid } from '@/lib/rainfallGrid';

// Mock react-leaflet's useMap. Track added/removed layers so we can
// assert on the incremental sync behavior.
const stubMap: {
  addLayerCalls: number;
  removeLayerCalls: number;
} = {
  addLayerCalls: 0,
  removeLayerCalls: 0,
};
vi.mock('react-leaflet', () => ({
  useMap: () => stubMap,
}));

// Mock leaflet so the test doesn't try to instantiate a real map layer.
// We capture every L.rectangle call so we can assert on the per-cell
// style and the diff between refetches.
interface MockRect {
  bounds: unknown;
  style: Record<string, unknown>;
  addedTo: unknown;
  removed: boolean;
  styleUpdates: number;
  setStyle: (style: Record<string, unknown>) => void;
}
const mockRects: MockRect[] = [];

vi.mock('leaflet', () => {
  const rectangle = (bounds: unknown, style: Record<string, unknown>) => {
    const rect: MockRect = {
      bounds,
      style,
      addedTo: null,
      removed: false,
      styleUpdates: 0,
      setStyle(newStyle: Record<string, unknown>) {
        Object.assign(this.style, newStyle);
        this.styleUpdates += 1;
      },
    };
    mockRects.push(rect);
    return {
      addTo(target: unknown) {
        rect.addedTo = target;
        stubMap.addLayerCalls += 1;
        return this;
      },
      remove() {
        if (rect.removed) return;
        rect.removed = true;
        stubMap.removeLayerCalls += 1;
      },
      setStyle: rect.setStyle.bind(rect),
    };
  };
  // Vitest ESM mock: must export both default and named export.
  return {
    default: { rectangle },
    rectangle,
  };
});

/**
 * Build a RainGrid from a per-cell array of per-step values.
 * Example: [ [ [1.0], [0] ], [ [0], [2.0] ] ] is a 2x2 grid with 1 step
 * and the values [1.0, 0, 0, 2.0] in row-major order.
 */
function makeGrid(values: number[][][]): RainGrid {
  const rows = values.length;
  const cols = values[0]?.length ?? 0;
  const stepCount = values[0]?.[0]?.length ?? 0;
  const cellLats = new Float64Array(rows);
  for (let r = 0; r < rows; r++) cellLats[r] = 21.328 + r * 0.018;
  const cellLons = new Float64Array(cols);
  for (let c = 0; c < cols; c++) cellLons[c] = 112.956 + c * 0.0195;
  const valuesArr = new Float32Array(rows * cols * stepCount);
  for (let s = 0; s < stepCount; s++) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        valuesArr[s * rows * cols + r * cols + c] = values[r][c][s];
      }
    }
  }
  return {
    rows,
    cols,
    cellLats,
    cellLons,
    stepCount,
    stepTimes: ['t0', 't1', 't2'].slice(0, stepCount),
    values: valuesArr,
  };
}

describe('RainfallCellsLayer', () => {
  beforeEach(() => {
    mockRects.length = 0;
    stubMap.addLayerCalls = 0;
    stubMap.removeLayerCalls = 0;
  });

  it('mounts one rectangle per cell with at least one non-zero value', async () => {
    // 2x3 grid (rows=2, cols=3, stepCount=1). Cells with value > 0:
    // (0,0)=1.0, (1,1)=2.0 → 2 rectangles. (0,1), (0,2), (1,0), (1,2)
    // are zero → no rectangles.
    const grid = makeGrid([
      [[1.0], [0], [0]],
      [[0], [2.0], [0]],
    ]);
    render(<RainfallCellsLayer grid={grid} activeStep={0} />);

    await waitFor(() => {
      expect(mockRects.length).toBe(2);
    });
    expect(stubMap.addLayerCalls).toBe(2);
    // Both rectangles should have a fillColor set (rgba with alpha 0.5).
    expect(mockRects[0].style.fillColor).toMatch(/rgba\(.*0\.5\)$/);
    expect(mockRects[1].style.fillColor).toMatch(/rgba\(.*0\.5\)$/);
  });

  it('skips cells that are zero for every step', async () => {
    // 2x2 grid, 2 steps. Cell (0,0) has rain only at step 0. Cell (1,1)
    // has rain only at step 1. Cells (0,1) and (1,0) are zero for all
    // steps → no rectangle. Total: 2 rectangles.
    const grid = makeGrid([
      [[1.0, 0]], [[0, 0]],
      [[0, 0]], [[0, 2.0]],
    ]);
    render(<RainfallCellsLayer grid={grid} activeStep={0} />);

    await waitFor(() => {
      expect(mockRects.length).toBe(2);
    });
  });

  it('hides rectangles whose value is 0 at the active step', async () => {
    // 1x2 grid, 2 steps. (0,0) = 1.0 at step 0, 0 at step 1.
    // (0,1) = 0 at step 0, 5.0 at step 1.
    const grid = makeGrid([
      [[1.0, 0]],
      [[0, 5.0]],
    ]);
    render(<RainfallCellsLayer grid={grid} activeStep={0} />);

    await waitFor(() => {
      expect(mockRects.length).toBe(2);
    });
    // Step 0: (0,0)=1.0 visible, (0,1)=0 hidden.
    expect(mockRects[0].style.fill).not.toBe(false);
    expect(mockRects[1].style.fill).toBe(false);
  });

  it('updates rectangle colors when activeStep changes', async () => {
    // 1x2 grid, 2 steps. (0,0) = 1.0 at step 0, 12.0 at step 1.
    // (0,1) = 5.0 at step 0, 0 at step 1.
    const grid = makeGrid([
      [[1.0, 12.0]],
      [[5.0, 0]],
    ]);
    const { rerender } = render(<RainfallCellsLayer grid={grid} activeStep={0} />);

    await waitFor(() => {
      expect(mockRects.length).toBe(2);
    });

    const step0Color0 = mockRects[0].style.fillColor as string;
    const step0Color1 = mockRects[1].style.fillColor as string;
    expect(step0Color0).toBeTruthy();
    expect(step0Color1).toBeTruthy();
    // Different bands → different colors.
    expect(step0Color0).not.toBe(step0Color1);

    const beforeUpdates = mockRects[0].styleUpdates;

    // Move to step 1: (0,0)=12.0 visible, (0,1)=0 hidden.
    rerender(<RainfallCellsLayer grid={grid} activeStep={1} />);

    expect(mockRects[0].style.fill).not.toBe(false);
    expect(mockRects[1].style.fill).toBe(false);
    expect(mockRects[0].styleUpdates).toBeGreaterThan(beforeUpdates);
  });

  it('skips setStyle for cells whose color is unchanged at the new step', async () => {
    // 1x2 grid, 2 steps. (0,0) and (0,1) both have the same value (1.0)
    // at both steps. The step-update effect should NOT call setStyle
    // on either rectangle when activeStep changes, because the rgba
    // color is identical. Caches (lastColor) make this O(changes) not
    // O(cells).
    const grid = makeGrid([
      [[1.0, 1.0]],
      [[2.0, 2.0]],
    ]);
    const { rerender } = render(<RainfallCellsLayer grid={grid} activeStep={0} />);

    await waitFor(() => {
      expect(mockRects.length).toBe(2);
    });

    const step0Updates0 = mockRects[0].styleUpdates;
    const step0Updates1 = mockRects[1].styleUpdates;

    // Move to step 1: same values → no setStyle calls.
    rerender(<RainfallCellsLayer grid={grid} activeStep={1} />);

    expect(mockRects[0].styleUpdates).toBe(step0Updates0);
    expect(mockRects[1].styleUpdates).toBe(step0Updates1);

    // Move back to step 0: still no setStyle calls.
    rerender(<RainfallCellsLayer grid={grid} activeStep={0} />);
    expect(mockRects[0].styleUpdates).toBe(step0Updates0);
    expect(mockRects[1].styleUpdates).toBe(step0Updates1);
  });

  it('only calls setStyle on cells whose color actually changes', async () => {
    // 1x3 grid, 2 steps. (0,0) = 1.0 both steps (no change).
    // (0,1) = 1.0 → 5.0 (change). (0,2) = 5.0 both steps (no change).
    const grid = makeGrid([
      [[1.0, 1.0]],
      [[1.0, 5.0]],
      [[5.0, 5.0]],
    ]);
    const { rerender } = render(<RainfallCellsLayer grid={grid} activeStep={0} />);

    await waitFor(() => {
      expect(mockRects.length).toBe(3);
    });

    const before0 = mockRects[0].styleUpdates;
    const before1 = mockRects[1].styleUpdates;
    const before2 = mockRects[2].styleUpdates;

    // Move to step 1: only rect at index 1 should get a setStyle call.
    rerender(<RainfallCellsLayer grid={grid} activeStep={1} />);

    expect(mockRects[0].styleUpdates).toBe(before0);
    expect(mockRects[1].styleUpdates).toBeGreaterThan(before1);
    expect(mockRects[2].styleUpdates).toBe(before2);
  });

  it('re-shows a cell that becomes visible after being hidden', async () => {
    // 1x1 grid, 3 steps. (0,0) = 0 (hidden), 5.0 (visible), 0 (hidden).
    // Regression test: setStyle merges into existing options, so without
    // explicit `fill: true` in VISIBLE_STYLE, a cell that was previously
    // hidden by setStyle({ fill: false }) would stay hidden after a
    // later setStyle({ fillColor: ... }) because the merge preserved
    // the old `fill: false` value.
    const grid = makeGrid([[[0, 5.0, 0]]]);
    const { rerender } = render(<RainfallCellsLayer grid={grid} activeStep={0} />);

    await waitFor(() => {
      expect(mockRects.length).toBe(1);
    });

    // Step 0: hidden.
    expect(mockRects[0].style.fill).toBe(false);

    // Step 1: must become visible (this is the regression case).
    rerender(<RainfallCellsLayer grid={grid} activeStep={1} />);
    expect(mockRects[0].style.fill).not.toBe(false);
    expect(mockRects[0].style.fillColor).toMatch(/rgba\(.*0\.5\)$/);

    // Step 2: hidden again.
    rerender(<RainfallCellsLayer grid={grid} activeStep={2} />);
    expect(mockRects[0].style.fill).toBe(false);

    // Step 1 again: must be visible again.
    rerender(<RainfallCellsLayer grid={grid} activeStep={1} />);
    expect(mockRects[0].style.fill).not.toBe(false);
  });

  it('removes all rectangles on unmount', async () => {
    const grid = makeGrid([[[1.0]], [[2.0]]]);
    const { unmount } = render(<RainfallCellsLayer grid={grid} activeStep={0} />);

    await waitFor(() => {
      expect(stubMap.addLayerCalls).toBe(2);
    });
    unmount();
    expect(stubMap.removeLayerCalls).toBe(2);
  });

  it('adds and removes rectangles incrementally on refetch with same shape', async () => {
    // Initial: 2x2 grid, 1 step. Cells (0,0)=1.0, (1,1)=2.0 active.
    // (0,1) and (1,0) zero → 2 rectangles.
    const initial = makeGrid([
      [[1.0], [0]],
      [[0], [2.0]],
    ]);
    const { rerender } = render(<RainfallCellsLayer grid={initial} activeStep={0} />);

    await waitFor(() => {
      expect(mockRects.length).toBe(2);
    });
    expect(stubMap.addLayerCalls).toBe(2);
    expect(stubMap.removeLayerCalls).toBe(0);

    // Refetch: same shape (rows=2, cols=2, same cellLats/cellLons) but
    // cell (0,1) now has rain at step 0 and cell (1,1) is now zero.
    // Expected: add one rectangle for (0,1), remove the rectangle for
    // (1,1). The original (0,0) rectangle stays alive.
    const refetched = makeGrid([
      [[1.0], [3.0]],
      [[0], [0]],
    ]);
    rerender(<RainfallCellsLayer grid={refetched} activeStep={0} />);

    // 1 new rectangle created, 1 removed. Total mocks: 3.
    expect(mockRects.length).toBe(3);
    expect(stubMap.addLayerCalls).toBe(3);
    expect(stubMap.removeLayerCalls).toBe(1);

    // The original (0,0) rectangle must still be present (not removed).
    expect(mockRects[0].removed).toBe(false);
    // The (1,1) rectangle (mockRects[1]) must be removed.
    expect(mockRects[1].removed).toBe(true);
    // The new (0,1) rectangle (mockRects[2]) must be added to the map.
    expect(mockRects[2].addedTo).toBe(stubMap);
  });

  it('does a full rebuild when grid shape changes', async () => {
    // Initial: 2x2 grid.
    const initial = makeGrid([
      [[1.0], [0]],
      [[0], [2.0]],
    ]);
    const { rerender } = render(<RainfallCellsLayer grid={initial} activeStep={0} />);

    await waitFor(() => {
      expect(mockRects.length).toBe(2);
    });

    // Refetch: shape changes to 3x3 (different cellLats, cellLons).
    // Expected: all existing rectangles removed, fresh ones created.
    const bigger = makeGrid([
      [[1.0], [0], [0]],
      [[0], [2.0], [0]],
      [[0], [0], [3.0]],
    ]);
    rerender(<RainfallCellsLayer grid={bigger} activeStep={0} />);

    // All old rectangles (2) removed.
    expect(mockRects[0].removed).toBe(true);
    expect(mockRects[1].removed).toBe(true);
    expect(stubMap.removeLayerCalls).toBe(2);
    // 3 new rectangles added.
    expect(stubMap.addLayerCalls).toBe(5);
  });

  it('derives cellBounds edge delta from observed cell pair, not HKO magic numbers', async () => {
    // 2x2 grid with non-standard lat/lon spacing (0.025 lat, 0.020 lon)
    // so the only cell with rain is the (0,0) corner. Its south and
    // west edges should extend by half of the observed first pair
    // delta — 0.0125 and 0.010 respectively — NOT 0.009 / 0.0095.
    const grid: RainGrid = {
      rows: 2,
      cols: 2,
      cellLats: new Float64Array([22.0, 22.025]),
      cellLons: new Float64Array([113.0, 113.020]),
      stepCount: 1,
      stepTimes: ['t0'],
      values: new Float32Array([1.0, 0, 0, 0]),
    };
    render(<RainfallCellsLayer grid={grid} activeStep={0} />);

    await waitFor(() => {
      expect(mockRects.length).toBe(1);
    });

    // The sole cell is (row=0, col=0) at center (22.0, 113.0).
    // South edge: 22.0 - 0.0125 = 21.9875 (observed lat step 0.025 / 2)
    // North edge: midpoint with row=1 (22.025) = 22.0125
    // West edge: 113.0 - 0.0100 = 112.9900 (observed lon step 0.020 / 2)
    // East edge: midpoint with col=1 (113.020) = 113.0100
    const bounds = mockRects[0].bounds as [[number, number], [number, number]];
    expect(bounds[0][0]).toBeCloseTo(21.9875, 5);
    expect(bounds[1][0]).toBeCloseTo(22.0125, 5);
    expect(bounds[0][1]).toBeCloseTo(112.99, 5);
    expect(bounds[1][1]).toBeCloseTo(113.01, 5);
  });
});
