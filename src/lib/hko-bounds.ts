/** HKO geographic bounds for coverage detection */

/** Hong Kong approximate bounding box */
export const HK_BOUNDS = {
  minLat: 22.15,
  maxLat: 22.56,
  minLon: 113.82,
  maxLon: 114.43,
};

/** Pearl River Delta bounding box for gridded rainfall nowcast map */
export const PRD_BOUNDS = {
  minLat: 21.30,
  maxLat: 23.50,
  minLon: 112.95,
  maxLon: 115.30,
};

/** Check if coordinates are within Hong Kong coverage area */
export function isInHongKong(lat: number, lon: number): boolean {
  return (
    lat >= HK_BOUNDS.minLat &&
    lat <= HK_BOUNDS.maxLat &&
    lon >= HK_BOUNDS.minLon &&
    lon <= HK_BOUNDS.maxLon
  );
}

/** Check if coordinates are within the Pearl River Delta rainfall nowcast coverage area */
export function isInRainfallRegion(lat: number, lon: number): boolean {
  return (
    lat >= PRD_BOUNDS.minLat &&
    lat <= PRD_BOUNDS.maxLat &&
    lon >= PRD_BOUNDS.minLon &&
    lon <= PRD_BOUNDS.maxLon
  );
}
