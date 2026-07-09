/** PSR (Probability of Significant Rain) normalization, conversion, and umbrella logic */

// Single source of truth: canonical PSR levels ordered by severity.
// Numeric value drives the umbrella threshold (>= Med means "bring umbrella").
export const PSR_LEVELS = {
  Low: 1,
  'Med Low': 2,
  Med: 3,
  'Med High': 4,
  High: 5,
} as const;

export type PsrLevel = keyof typeof PSR_LEVELS;

/** Percentage value for each PSR level (used by `psrToPercentage`) */
const PSR_PERCENTAGE: Record<PsrLevel, number> = {
  Low: 10,
  'Med Low': 25,
  Med: 50,
  'Med High': 70,
  High: 85,
};

/** Raw string → canonical PSR level (handles API variants like "Medium" and Chinese) */
const RAW_TO_LEVEL: Record<string, PsrLevel> = {
  // English variants
  Low: 'Low',
  'Medium Low': 'Med Low',
  'Med Low': 'Med Low',
  Medium: 'Med',
  Med: 'Med',
  'Medium High': 'Med High',
  High: 'High',
  // Traditional Chinese
  低: 'Low',
  中低: 'Med Low',
  中: 'Med',
  中高: 'Med High',
  高: 'High',
};

/** Canonical level → numeric value (for raw callers that bypass RAW_TO_LEVEL) */
const LEVEL_TO_VALUE: Record<string, number> = {
  Low: PSR_LEVELS.Low,
  'Med Low': PSR_LEVELS['Med Low'],
  Med: PSR_LEVELS.Med,
  'Medium': PSR_LEVELS.Med,
  'Medium Low': PSR_LEVELS['Med Low'],
  'Medium High': PSR_LEVELS['Med High'],
  High: PSR_LEVELS.High,
  低: PSR_LEVELS.Low,
  中低: PSR_LEVELS['Med Low'],
  中: PSR_LEVELS.Med,
  中高: PSR_LEVELS['Med High'],
  高: PSR_LEVELS.High,
};

/** Umbrella threshold — bring umbrella if PSR is at or above this level. */
export const UMBRELLA_THRESHOLD: PsrLevel = 'Med';

/** Normalize raw PSR string from HKO API to a canonical level label */
export function normalizePsr(psr: string | undefined): PsrLevel | undefined {
  if (!psr) return undefined;
  return RAW_TO_LEVEL[psr];
}

/** Convert PSR string (canonical or raw) to percentage value */
export function psrToPercentage(psr: string): number {
  const level = RAW_TO_LEVEL[psr];
  if (level) return PSR_PERCENTAGE[level];
  return 0;
}

/** Check if PSR string indicates umbrella needed (at or above UMBRELLA_THRESHOLD) */
export function psrNeedsUmbrella(psr: string | undefined): boolean {
  if (!psr) return false;
  const value = LEVEL_TO_VALUE[psr];
  if (value === undefined) return false;
  return value >= PSR_LEVELS[UMBRELLA_THRESHOLD];
}