/** Geocoding: city search, reverse geocoding, browser geolocation */

import { fetchWithTimeout } from '../fetch-utils';
import { logError, logWarn } from '../log';
import { TIMING } from '../constants';
import { GeoLocation } from './types';
import { parseNominatimSearch, parseNominatimReverse, logParseWarnings } from '../parsers';

/** Search for cities by name via Open-Meteo geocoding API. The raw response
 *  is passed through `parseNominatimSearch` which validates each result row
 *  and drops malformed entries; the caller always gets a typed array. */
export async function searchCities(query: string): Promise<GeoLocation[]> {
  if (query.length < 2) return [];
  if (query.length > 100) return [];

  if (!/^[a-zA-Z0-9\s\-',.]+$/.test(query)) return [];

  let raw: unknown;
  try {
    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`
    );

    if (!response.ok) throw new Error('Failed to search cities');

    raw = await response.json();
  } catch (err) {
    logError('Error searching cities:', err);
    return [];
  }

  const { data, warnings } = parseNominatimSearch(raw);
  logParseWarnings('Nominatim search', warnings);
  return data ?? [];
}

/** Reverse geocode coordinates to a city name via Nominatim. The raw response
 *  is passed through `parseNominatimReverse` which always returns a typed
 *  GeoLocation (falling back to a "Current Location" placeholder when the
 *  response shape is empty or unexpected). */
export async function reverseGeocode(latitude: number, longitude: number): Promise<GeoLocation | null> {
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  let raw: unknown;
  try {
    const start = Date.now();
    const cityResponse = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(latitude.toString())}&lon=${encodeURIComponent(longitude.toString())}&format=json`,
      {
        headers: { 'User-Agent': 'weather-whisperer/1.0' },
        timeout: TIMING.REVERSE_GEOCODE_TIMEOUT_MS
      }
    );

    if (!cityResponse.ok) {
      logWarn(`Reverse geocode failed with status ${cityResponse.status} after ${Date.now() - start}ms`);
      return {
        name: 'Current Location',
        latitude,
        longitude,
        country: '',
      };
    }

    raw = await cityResponse.json();
  } catch {
    return {
      name: 'Current Location',
      latitude,
      longitude,
      country: '',
    };
  }

  const { data, warnings } = parseNominatimReverse(raw, { latitude, longitude });
  logParseWarnings('Nominatim reverse', warnings);
  return data;
}

/** Get user's current location via browser geolocation API */
export function getUserLocation(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        reject(error);
      },
      { timeout: TIMING.GEOLOCATION_TIMEOUT_MS, enableHighAccuracy: false }
    );
  });
}