/**
 * Shared-location deep links.
 *
 * A share message can end with `https://<app>/?lat=&lon=&name=` so whoever
 * opens it lands directly on the sender's city's weather — no geolocation
 * prompt, no storage writes on the visitor's device. `buildDeepLinkUrl`
 * (share-forecast.ts) produces the params; this module reads them back and
 * cleans them up once the visitor picks a city of their own.
 */

import type { GeoLocation } from './types';

/** Guard against absurd hand-crafted names bloating the header. */
const MAX_NAME_LENGTH = 100;

/**
 * Reads a shared location out of a query string (`window.location.search`
 * in the app; tests pass their own string). Returns null for anything
 * missing or malformed so callers fall through to the normal first-run
 * flow. `name` is empty when the link carries none — callers may enrich it
 * with a reverse geocode; `country`/`admin1` are always empty because the
 * link format doesn't carry them.
 */
export function parseDeepLinkLocation(search: string): GeoLocation | null {
  const params = new URLSearchParams(search);
  const latRaw = params.get('lat');
  const lonRaw = params.get('lon');
  // Missing or empty params are malformed — note Number(null) is 0, so the
  // presence check must come before the numeric one.
  if (!latRaw || !lonRaw) return null;
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const name = (params.get('name') ?? '').trim().slice(0, MAX_NAME_LENGTH);
  return {
    name,
    latitude: lat,
    longitude: lon,
    country: '',
  };
}

/**
 * Strips the deep-link params from the URL bar. Called whenever the visitor
 * explicitly picks a city, so a refresh afterwards keeps their choice
 * instead of bouncing back to the shared view. No-op on a param-free URL,
 * which makes it free in normal sessions.
 */
export function clearDeepLinkParams(): void {
  if (!window.location.search) return;
  window.history.replaceState(null, '', window.location.pathname);
}
