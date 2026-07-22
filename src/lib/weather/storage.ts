/** localStorage helpers for default and recent cities, plus the last-known weather snapshot */

import { GeoLocation, WeatherData } from './types';
import { LAST_KNOWN_SCHEMA_VERSION, STORAGE_KEYS } from '../constants';
import { logWarn } from '../log';

const MAX_RECENT_CITIES = 3;

/**
 * Schema-versioned envelope around the last-known weather payload.
 * The version field lets us drop the snapshot on breaking changes without
 * crashing the app on cold load.
 */
export type LastKnownEnvelope = {
  v: typeof LAST_KNOWN_SCHEMA_VERSION;
  /** Stable city identifier — `${lat.toFixed(2)},${lon.toFixed(2)}` */
  cityId: string;
  /** Language the payload was fetched in */
  lang: 'en' | 'tc';
  /** Epoch ms of the most recent successful fetch */
  fetchedAt: number;
  /** Payload (includes the per-source `sources` field) */
  data: WeatherData;
};

/** Build a stable city id from coordinates (matches the orchestrator's keying). */
export function makeCityId(latitude: number, longitude: number): string {
  return `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
}

/**
 * Read the last-known weather snapshot, or null if absent / stale / corrupt /
 * version-mismatched / city-mismatched. The cityId guard ensures we never
 * paint a snapshot for a city the user is no longer looking at.
 */
export function readLastKnownWeather(currentCityId: string): LastKnownEnvelope | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEYS.LAST_KNOWN);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LastKnownEnvelope;
    if (!parsed || parsed.v !== LAST_KNOWN_SCHEMA_VERSION) {
      logWarn(`[storage] dropped last-known snapshot: version mismatch (got ${parsed?.v ?? 'missing'})`);
      return null;
    }
    if (parsed.cityId !== currentCityId) return null;
    if (typeof parsed.fetchedAt !== 'number') {
      logWarn('[storage] dropped last-known snapshot: fetchedAt missing or wrong type');
      return null;
    }
    if (!parsed.data || typeof parsed.data !== 'object') {
      logWarn('[storage] dropped last-known snapshot: data field missing or wrong type');
      return null;
    }
    return parsed;
  } catch (err) {
    logWarn('[storage] dropped last-known snapshot: JSON parse error', err);
    return null;
  }
}

/** Persist a successful fetch as the cold-start seed for next mount. */
export function writeLastKnownWeather(
  cityId: string,
  lang: 'en' | 'tc',
  data: WeatherData,
): void {
  if (typeof window === 'undefined') return;
  try {
    const envelope: LastKnownEnvelope = {
      v: LAST_KNOWN_SCHEMA_VERSION,
      cityId,
      lang,
      fetchedAt: Date.now(),
      data,
    };
    window.localStorage.setItem(STORAGE_KEYS.LAST_KNOWN, JSON.stringify(envelope));
  } catch {
    // localStorage may be full or disabled (private mode). Failure is non-fatal.
  }
}

/** Remove the snapshot. Called on city switch and on schema migration. */
export function clearLastKnownWeather(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEYS.LAST_KNOWN);
  } catch {
    // ignore
  }
}

export function getDefaultCity(): GeoLocation | null {
  const stored = localStorage.getItem(STORAGE_KEYS.DEFAULT_CITY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as GeoLocation;
  } catch {
    return null;
  }
}

export function setDefaultCity(city: GeoLocation): void {
  localStorage.setItem(STORAGE_KEYS.DEFAULT_CITY, JSON.stringify(city));
  addRecentCity(city);
}

export function getRecentCities(): GeoLocation[] {
  const stored = localStorage.getItem(STORAGE_KEYS.RECENT_CITIES);
  if (!stored) return [];
  try {
    return JSON.parse(stored) as GeoLocation[];
  } catch {
    return [];
  }
}

function addRecentCity(city: GeoLocation): void {
  const recent = getRecentCities();
  const filtered = recent.filter(
    (c) => !(c.latitude === city.latitude && c.longitude === city.longitude)
  );
  filtered.unshift(city);
  localStorage.setItem(STORAGE_KEYS.RECENT_CITIES, JSON.stringify(filtered.slice(0, MAX_RECENT_CITIES)));
}