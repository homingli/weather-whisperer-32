/** PSR (Probability of Significant Rain) normalization, conversion, and umbrella logic */

// Standardized PSR level ladder
const PSR_MAP: Record<string, string> = {
  'Low': 'Low',
  'Medium Low': 'Med Low',
  'Med Low': 'Med Low',
  'Medium': 'Med',
  'Med': 'Med',
  'Medium High': 'Med High',
  'High': 'High',
  // Chinese variants
  '低': 'Low',
  '中低': 'Med Low',
  '中': 'Med',
  '中高': 'Med High',
  '高': 'High',
};

const PSR_PERCENTAGE: Record<string, number> = {
  // Normalized
  'Low': 10,
  'Med Low': 25,
  'Med': 50,
  'Med High': 70,
  'High': 85,
  // Raw variants (for direct callers)
  'Medium Low': 25,
  'Medium': 50,
  'Medium High': 70,
  // Chinese
  '低': 10,
  '中低': 25,
  '中': 50,
  '中高': 70,
  '高': 85,
};

const UMBRELLA_LEVELS = new Set([
  'Med Low', 'Med', 'Med High', 'High',
]);

/** Normalize raw PSR string from HKO API to a standard label */
export function normalizePsr(psr: string | undefined): string | undefined {
  if (!psr) return undefined;
  return PSR_MAP[psr] || undefined;
}

/** Convert PSR label to percentage value */
export function psrToPercentage(psr: string): number {
  return PSR_PERCENTAGE[psr] || 0;
}

/** Check if PSR indicates umbrella needed (Med Low and above) */
export function psrNeedsUmbrella(psr: string | undefined): boolean {
  if (!psr) return false;
  const normalized = normalizePsr(psr);
  return normalized ? UMBRELLA_LEVELS.has(normalized) : false;
}
