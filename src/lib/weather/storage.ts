/** localStorage helpers for default and recent cities */

import { GeoLocation } from './types';

const STORAGE_KEY = 'weather-default-city';
const RECENT_CITIES_KEY = 'weather-recent-cities';
const MAX_RECENT_CITIES = 3;

export function getDefaultCity(): GeoLocation | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as GeoLocation;
  } catch {
    return null;
  }
}

export function setDefaultCity(city: GeoLocation): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(city));
  addRecentCity(city);
}

export function getRecentCities(): GeoLocation[] {
  const stored = localStorage.getItem(RECENT_CITIES_KEY);
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
  localStorage.setItem(RECENT_CITIES_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT_CITIES)));
}