// Color band thresholds for the HKO nowcast overlay. Extracted so the parser,
// the canvas layer, and the legend all resolve colors from the same source.
export const RAINFALL_BANDS = [
  { max: 0.5, color: '#a0c4ff', label: '< 0.5' },
  { max: 2, color: '#4facfe', label: '0.5 - 2' },
  { max: 5, color: '#00f2fe', label: '2 - 5' },
  { max: 10, color: '#43e97b', label: '5 - 10' },
  { max: 20, color: '#f6d365', label: '10 - 20' },
  { max: 30, color: '#ff0844', label: '20 - 30' },
  { max: Infinity, color: '#9d0b0b', label: '> 30' },
] as const;

export function getRainfallColor(value: number): string {
  for (const band of RAINFALL_BANDS) {
    if (value <= band.max) return band.color;
  }
  return RAINFALL_BANDS[RAINFALL_BANDS.length - 1].color;
}
