// Tests for the rainfall grid builder. Exercises the observed-lat/lon path
// (the current implementation) so a regression to the fixed-cell-size
// approach (CELL_DLAT=0.009, CELL_DLON=0.0095) would be caught here.

import { describe, it, expect } from 'vitest';
import {
  buildRainGrid,
  parseRainfallCSVText,
  type CellRow,
} from './rainfallGrid';

describe('parseRainfallCSVText', () => {
  it('parses rows and filters out zero/negative values', () => {
    const csv = [
      'Updated,Ending,Latitude,Longitude,Value',
      '202605171600,202605171630,22.31,114.17,1.5',
      '202605171600,202605171630,22.30,114.17,0.0',
      '202605171600,202605171630,22.25,114.17,-0.5',
      '202605171600,202605171630,22.20,114.10,12.5',
    ].join('\n');

    const result = parseRainfallCSVText(csv);
    expect(result.rows.length).toBe(2);
    expect(result.rows[0]).toEqual({
      endTime: '202605171630',
      lat: 22.31,
      lon: 114.17,
      value: 1.5,
    });
    expect(result.updateTime).toBe('2026-05-17 16:00');
  });

  it('skips malformed rows without throwing', () => {
    const csv = [
      'Updated,Ending,Latitude,Longitude,Value',
      '202605171600,202605171630,22.31,114.17,1.5',
      'short,row',
      ',,,,',
      '202605171600,202605171630,bad,coords,here',
    ].join('\n');

    const result = parseRainfallCSVText(csv);
    expect(result.rows.length).toBe(1);
  });
});

describe('buildRainGrid', () => {
  it('returns null for empty input', () => {
    expect(buildRainGrid([])).toBeNull();
  });

  it('returns null when all rows have value <= 0', () => {
    const rows: CellRow[] = [
      { endTime: '1', lat: 22.3, lon: 114.1, value: 0 },
      { endTime: '1', lat: 22.4, lon: 114.2, value: -1 },
    ];
    expect(buildRainGrid(rows)).toBeNull();
  });

  it('builds a grid from observed lat/lon values (no fixed dLat/dLon)', () => {
    // HKO real-data shape: 3 unique lats, 4 unique lons, 2 steps.
    const rows: CellRow[] = [
      { endTime: '202605171630', lat: 22.31, lon: 114.17, value: 1.5 },
      { endTime: '202605171630', lat: 22.31, lon: 114.18, value: 2.0 },
      { endTime: '202605171630', lat: 22.33, lon: 114.17, value: 3.5 },
      { endTime: '202605171630', lat: 22.33, lon: 114.19, value: 0.8 },
      { endTime: '202605171630', lat: 22.33, lon: 114.20, value: 4.0 },
      { endTime: '202605171700', lat: 22.31, lon: 114.17, value: 12.5 },
      { endTime: '202605171700', lat: 22.32, lon: 114.18, value: 6.0 },
    ];

    const grid = buildRainGrid(rows);
    expect(grid).not.toBeNull();
    expect(grid!.rows).toBe(3); // 3 unique lats
    expect(grid!.cols).toBe(4); // 4 unique lons
    expect(grid!.stepCount).toBe(2);
    expect(grid!.stepTimes).toEqual(['16:30', '17:00']);

    // Cell lats are sorted south→north.
    expect(Array.from(grid!.cellLats)).toEqual([22.31, 22.32, 22.33]);
    // Cell lons are sorted west→east.
    expect(Array.from(grid!.cellLons)).toEqual([114.17, 114.18, 114.19, 114.20]);

    // Storage layout: values[step * rows * cols + row * cols + col].
    // Step 0, row 0 (22.31), col 0 (114.17) → idx 0.
    const stride0 = 3 * 4;
    expect(grid!.values[0]).toBe(1.5);
    // Step 1, row 1 (22.32), col 1 (114.18) → idx stride0 + 1*4 + 1 = stride0 + 5.
    expect(grid!.values[stride0 + 5]).toBe(6.0);
  });

  it('handles non-uniform cell spacing (HKO mixes 0.017/0.018/0.019 lat steps)', () => {
    // Real HKO spacing is not perfectly uniform. Verify each cell still
    // resolves to the correct observed lat/lon.
    const rows: CellRow[] = [
      { endTime: '1', lat: 21.328, lon: 112.956, value: 0.5 },
      { endTime: '1', lat: 21.346, lon: 112.956, value: 1.0 },
      { endTime: '1', lat: 21.365, lon: 112.956, value: 1.5 },
      { endTime: '1', lat: 21.383, lon: 112.956, value: 2.0 },
      { endTime: '1', lat: 21.401, lon: 112.956, value: 2.5 },
    ];

    const grid = buildRainGrid(rows);
    expect(grid).not.toBeNull();
    expect(grid!.rows).toBe(5);
    expect(grid!.cols).toBe(1);
    // Spacing between consecutive rows is non-uniform: 0.018, 0.019, 0.018, 0.018.
    const dLat0 = grid!.cellLats[1] - grid!.cellLats[0];
    const dLat1 = grid!.cellLats[2] - grid!.cellLats[1];
    expect(dLat0).toBeCloseTo(0.018, 5);
    expect(dLat1).toBeCloseTo(0.019, 5);
  });

  it('matches the real 121×121 grid for an HKO-shaped CSV', () => {
    // The real HKO feed publishes 121×121 cells per step. Verify the grid
    // builder produces exactly 121 rows × 121 cols when given a full grid.
    // We model "every cell has a non-zero value somewhere in the timeseries"
    // by giving every cell a small baseline value; the 5 hot cells get the
    // values we want to spot-check.
    const cellLats: number[] = [];
    const cellLons: number[] = [];
    for (let r = 0; r < 121; r++) {
      cellLats.push(21.328 + r * 0.018);
    }
    for (let c = 0; c < 121; c++) {
      cellLons.push(112.956 + c * 0.0195);
    }
    const rows: CellRow[] = [];
    for (let r = 0; r < 121; r++) {
      for (let c = 0; c < 121; c++) {
        const value =
          (r === 0 && c === 0) ? 0.5 :
          (r === 60 && c === 60) ? 1.5 :
          (r === 120 && c === 120) ? 2.5 :
          (r === 60 && c === 0) ? 3.5 :
          (r === 0 && c === 120) ? 12.5 :
          0.1; // baseline so every (lat, lon) is registered
        rows.push({ endTime: 't', lat: cellLats[r], lon: cellLons[c], value });
      }
    }

    const grid = buildRainGrid(rows);
    expect(grid).not.toBeNull();
    expect(grid!.rows).toBe(121);
    expect(grid!.cols).toBe(121);
    // Total cells per step: 121 * 121 = 14,641.
    expect(grid!.values.length).toBe(121 * 121);
    // Spot-check the 5 hot values (baseline cells are 0.1 but the 5 hot
    // cells have higher values, so they should match).
    const idx = (s: number, r: number, c: number) => s * 121 * 121 + r * 121 + c;
    expect(grid!.values[idx(0, 0, 0)]).toBe(0.5);
    expect(grid!.values[idx(0, 60, 60)]).toBe(1.5);
    expect(grid!.values[idx(0, 120, 120)]).toBe(2.5);
    expect(grid!.values[idx(0, 60, 0)]).toBe(3.5);
    expect(grid!.values[idx(0, 0, 120)]).toBe(12.5);
  });

  it('snaps out-of-order lat/lon inputs to their observed positions', () => {
    // Rows arrive in arbitrary order; verify the grid still maps correctly.
    const rows: CellRow[] = [
      { endTime: 't', lat: 22.33, lon: 114.19, value: 2.5 },
      { endTime: 't', lat: 22.31, lon: 114.17, value: 0.5 },
      { endTime: 't', lat: 22.32, lon: 114.18, value: 1.5 },
      { endTime: 't', lat: 22.31, lon: 114.19, value: 3.5 },
    ];

    const grid = buildRainGrid(rows);
    expect(grid).not.toBeNull();
    // Lat 22.31 should be row 0 (smallest). Lat 22.33 should be row 2.
    expect(grid!.cellLats[0]).toBe(22.31);
    expect(grid!.cellLats[2]).toBe(22.33);
    // Lon 114.17 should be col 0. Lon 114.19 should be col 2.
    expect(grid!.cellLons[0]).toBe(114.17);
    expect(grid!.cellLons[2]).toBe(114.19);
    // Storage layout: values[step * rows * cols + row * cols + col].
    // step=0, row=0, col=0 → idx 0.
    expect(grid!.values[0]).toBe(0.5);
    // step=0, row=2, col=2 → idx 2*3 + 2 = 8.
    expect(grid!.values[2 * 3 + 2]).toBe(2.5);
  });
});
