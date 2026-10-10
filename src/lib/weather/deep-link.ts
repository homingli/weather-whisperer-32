/**
 * Shared-location deep links.
 *
 * A share message can end with `https://<app>/?lat=&lon=&name=` so whoever
 * opens it lands directly on the sender's city's weather — no geolocation
 * prompt, no storage writes on the visitor's device. `buildDeepLinkUrl`
 * (share-forecast.ts) produces the params; this module reads them back,
 * tracks whether the current page load IS such a visit, and cleans the
 * params up once the visitor picks a city of their own.
 */

import type { GeoLocation } from './types';

/** Guard against absurd hand-crafted names bloating the header. */
const MAX_NAME_LENGTH = 100;

/** Query params owned by the deep-link format. */
const DEEP_LINK_PARAMS = ['lat', 'lon', 'name'] as const;

/**
 * True while the current page load was entered through a deep link and the
 * visitor hasn't picked a city of their own yet. weather-manager checks this
 * before writing the last-known snapshot so a spectator visit doesn't clobber
 * the visitor's own cold-start seed. Module state is deliberate: it lives
 * exactly as long as the page, so a reload re-derives it from the URL.
 */
let deepLinkSession = false;

export function isDeepLinkSession(): boolean {
  return deepLinkSession;
}

export function setDeepLinkSession(active: boolean): void {
  deepLinkSession = active;
}

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
 * Strips the deep-link params from the URL bar, leaving any unrelated
 * params (utm tags etc.) in place. Called whenever the visitor explicitly
 * picks a city, so a refresh afterwards keeps their choice instead of
 * bouncing back to the shared view. No-op on a param-free URL, which makes
 * it free in normal sessions.
 */
export function clearDeepLinkParams(): void {
  if (!window.location.search) return;
  const params = new URLSearchParams(window.location.search);
  const hadDeepLinkParams = DEEP_LINK_PARAMS.some((key) => params.has(key));
  if (!hadDeepLinkParams) return;
  for (const key of DEEP_LINK_PARAMS) params.delete(key);
  const rest = params.toString();
  window.history.replaceState(
    null,
    '',
    rest ? `${window.location.pathname}?${rest}` : window.location.pathname,
  );
}
