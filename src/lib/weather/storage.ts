/** localStorage helpers for default and recent cities */

import { GeoLocation } from './types';
import { STORAGE_KEYS } from '../constants';

const MAX_RECENT_CITIES = 3;

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