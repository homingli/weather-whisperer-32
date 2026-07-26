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

/**
 * Convert a Celsius value to the display unit (integer). Returns the raw
 * numeric value — caller is responsible for appending the unit label.
 */
export function toDisplayTemperature(celsius: number, units: Units): number {
  if (units === 'us') return Math.round(celsiusToFahrenheit(celsius));
  return Math.round(celsius);
}

/** Same as `toDisplayTemperature` but for wind speed. */
export function toDisplayWindSpeed(kmh: number, units: Units): number {
  if (units === 'us') return Math.round(kmhToMph(kmh));
  return Math.round(kmh);
}

/** Same as `toDisplayTemperature` but for precipitation. Not rounded so
 *  callers can choose precision (mm: 1 decimal, in: 2 decimal). */
export function toDisplayPrecipitation(mm: number, units: Units): number {
  if (units === 'us') return mmToInches(mm);
  return mm;
}

/** Unit suffix string for temperature in the active unit. */
export function temperatureUnitLabel(units: Units): string {
  return units === 'us' ? '°F' : '°C';
}

/** Unit label for wind speed (matches existing LanguageContext keys for i18n). */
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
  return `${toDisplayWindSpeed(kmh, units)}`;
}

/** Format a precipitation amount in mm for display.
 *  Metric: 1 decimal mm. US: 2 decimal in (preserves sub-mm "trace" precision). */
export function formatPrecipitation(mm: number, units: Units): string {
  if (units === 'us') {
    return mmToInches(mm).toFixed(2);
  }
  return mm.toFixed(1);
}