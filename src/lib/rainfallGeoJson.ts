import type { RainGrid } from './rainfallGrid';

export interface RainfallFeature {
  type: 'Feature';
  id: number;
  properties: { value: number };
  geometry: { type: 'Polygon'; coordinates: number[][][] };
}

export interface RainfallFeatureCollection {
  type: 'FeatureCollection';
  features: RainfallFeature[];
}

function bounds(grid: RainGrid, row: number, col: number): [number, number, number, number] {
  const latStep = grid.rows > 1 ? Math.abs(grid.cellLats[1] - grid.cellLats[0]) : 0.018;
  const lonStep = grid.cols > 1 ? Math.abs(grid.cellLons[1] - grid.cellLons[0]) : 0.0195;
  const lat = grid.cellLats[row];
  const lon = grid.cellLons[col];
  const south = row > 0 ? (grid.cellLats[row - 1] + lat) / 2 : lat - latStep / 2;
  const north = row < grid.rows - 1 ? (lat + grid.cellLats[row + 1]) / 2 : lat + latStep / 2;
  const west = col > 0 ? (grid.cellLons[col - 1] + lon) / 2 : lon - lonStep / 2;
  const east = col < grid.cols - 1 ? (lon + grid.cellLons[col + 1]) / 2 : lon + lonStep / 2;
  return [south, west, north, east];
}

/** Convert HKO's internal [latitude, longitude] grid to GeoJSON [longitude, latitude]. */
export function rainfallGridToGeoJson(grid: RainGrid, activeStep: number): RainfallFeatureCollection {
  const step = Math.max(0, Math.min(activeStep, grid.stepCount - 1));
  const features: RainfallFeature[] = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const id = row * grid.cols + col;
      const value = grid.values[step * grid.rows * grid.cols + id];
      const [south, west, north, east] = bounds(grid, row, col);
      features.push({
        type: 'Feature',
        id,
        properties: { value },
        geometry: {
          type: 'Polygon',
          // GeoJSON mandates [longitude, latitude], unlike HKO/tabular arrays.
          coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
