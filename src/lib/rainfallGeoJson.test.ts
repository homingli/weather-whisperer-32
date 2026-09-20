import { describe, expect, it } from 'vitest';
import { rainfallGridToGeoJson } from './rainfallGeoJson';
import type { RainGrid } from './rainfallGrid';

describe('rainfallGridToGeoJson', () => {
  it('reverses HKO [latitude, longitude] into GeoJSON [longitude, latitude]', () => {
    const grid: RainGrid = {
      rows: 2,
      cols: 2,
      cellLats: Float64Array.from([22, 22.02]),
      cellLons: Float64Array.from([114, 114.02]),
      stepCount: 1,
      stepTimes: ['00:00'],
      stepEndTimesRaw: ['202609170000'],
      values: Float32Array.from([1, 0, 0, 0]),
    };
    const ring = rainfallGridToGeoJson(grid, 0).features[0].geometry.coordinates[0];
    expect(ring[0][0]).toBeCloseTo(113.99, 8);
    expect(ring[0][1]).toBeCloseTo(21.99, 8);
    expect(ring.at(-1)).toEqual(ring[0]);
  });
});
