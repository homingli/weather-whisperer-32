// Tests for RainfallCellsLayer. Verifies the cell rectangle count and
// the active-step fill-color resolution. Mocks leaflet so the tests
// run in jsdom without a real map.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { RainfallCellsLayer } from './RainfallCellsLayer';
import type { RainGrid } from '@/lib/rainfallGrid';

// Mock react-leaflet's useMap.
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
// We capture the L.rectangle calls so we can assert on them.
interface MockRect {
  bounds: unknown;
  style: Record<string, unknown>;
  addedTo: unknown;
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
    activeStep: 0,
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
});
