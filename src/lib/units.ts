/**
 * Unit conversion helpers for the metric ↔ US display toggle.
 *
 * Source data (Open-Meteo, HKO) stays metric. Conversion happens only at the
 * display layer via these helpers. Keep the functions pure; the unit choice
 * is passed in by the consumer via the `useUnits()` hook.
 *
 * Two flavors of helpers:
 * - `toDisplay*` — returns the raw numeric value in the active unit (no
 *   label suffix). Use these when the caller renders the unit label
 *   separately (e.g. chart axes, where the tick position must match the
 *   label).
 * - `format*` — returns a fully formatted string with the unit suffix.
 *   Use these for inline read-outs (hero, tooltip, sr-only tables).
 */

export type Units = 'metric' | 'us';

/** Celsius → Fahrenheit. */
export function celsiusToFahrenheit(c: number): number {
  return c * (9 / 5) + 32;
}

/** km/h → mph. 1 km/h = 0.621371 mph exactly. */
export function kmhToMph(kmh: number): number {
  return kmh * 0.621371;
}

/** mm → inches. 1 mm = 0.0393701 in exactly. */
export function mmToInches(mm: number): number {
  return mm * 0.0393701;
}

/** Convert a Celsius value to the display unit (integer). */
export function toDisplayTemperature(celsius: number, units: Units): number {
  if (units === 'us') return Math.round(celsiusToFahrenheit(celsius));
  return Math.round(celsius);
}

/** Unit suffix string for temperature in the active unit. */
export function temperatureUnitLabel(units: Units): string {
  return units === 'us' ? '°F' : '°C';
}

/** Unit label for wind speed. */
export function windSpeedUnitLabel(units: Units): string {
  return units === 'us' ? 'mph' : 'km/h';
}

/** Unit label for precipitation. */
export function precipitationUnitLabel(units: Units): string {
  return units === 'us' ? 'in' : 'mm';
}

/** Format a Celsius value for display in the chosen unit system. Integer °C/°F. */
export function formatTemperature(celsius: number, units: Units): string {
  return `${toDisplayTemperature(celsius, units)}${temperatureUnitLabel(units)}`;
}

/** Format a wind speed in km/h for display. Integer mph in US mode, integer km/h in metric. */
export function formatWindSpeed(kmh: number, units: Units): string {
  if (units === 'us') return `${Math.round(kmhToMph(kmh))}`;
  return `${Math.round(kmh)}`;
}

/** Format a precipitation amount in mm for display.
 *  Metric: 1 decimal mm. US: 2 decimal in (preserves sub-mm "trace" precision). */
export function formatPrecipitation(mm: number, units: Units): string {
  if (units === 'us') {
    return mmToInches(mm).toFixed(2);
  }
  return mm.toFixed(1);
}

/**
 * Format a Celsius value for the hero numeral — bare `°` suffix, no C/F
 * letter. The unit context is shown on the range bar above and the menu
 * selection; the editorial hero stays clean. Returns `—` when the value is
 * below `SENTINEL_THRESHOLD` (signals "no data yet").
 */
export function formatHeroTemperature(celsius: number, units: Units, sentinelThreshold: number): string {
  if (celsius < sentinelThreshold) return '—';
  return `${toDisplayTemperature(celsius, units)}°`;
}