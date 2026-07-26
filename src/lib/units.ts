/**
 * Unit conversion helpers for the metric ↔ US display toggle.
 *
 * Source data (Open-Meteo, HKO) stays metric. Conversion happens only at the
 * display layer via these helpers. Keep the functions pure; the unit choice
 * is passed in by the consumer via the `useUnits()` hook.
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

/** Format a Celsius value for display in the chosen unit system. Integer °C/°F. */
export function formatTemperature(celsius: number, units: Units): string {
  if (units === 'us') {
    return `${Math.round(celsiusToFahrenheit(celsius))}°F`;
  }
  return `${Math.round(celsius)}°C`;
}

/** Format a wind speed in km/h for display. Integer mph in US mode, integer km/h in metric. */
export function formatWindSpeed(kmh: number, units: Units): string {
  if (units === 'us') {
    return `${Math.round(kmhToMph(kmh))}`;
  }
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