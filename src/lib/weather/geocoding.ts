/** Geocoding: city search, reverse geocoding, browser geolocation */

import { fetchWithTimeout } from '../fetch-utils';
import { logError, logWarn } from '../log';
import { TIMING } from '../constants';
import { GeoLocation } from './types';

/** Search for cities by name via Open-Meteo geocoding API */
export async function searchCities(query: string): Promise<GeoLocation[]> {
  if (query.length < 2) return [];
  if (query.length > 100) return [];

  if (!/^[a-zA-Z0-9\s\-',.]+$/.test(query)) return [];

  try {
    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`
    );

    if (!response.ok) throw new Error('Failed to search cities');

    const data = await response.json();
    return (data.results || []).map((r: { name: string; latitude: number; longitude: number; country: string; admin1?: string }) => ({
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      country: r.country,
      admin1: r.admin1,
    }));
  } catch (err) {
    logError('Error searching cities:', err);
    return [];
  }
}

// logError is used in searchCities — import it lazily to keep this file focused.
// Imported here to avoid a forward declaration in the catch block above.
import { logError } from '../log';

/** Reverse geocode coordinates to a city name via Nominatim */
export async function reverseGeocode(latitude: number, longitude: number): Promise<GeoLocation | null> {
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

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

    const data = await cityResponse.json();
    const address = data.address || {};

    return {
      name: address.city || address.town || address.village || address.municipality || 'Current Location',
      latitude,
      longitude,
      country: address.country || '',
      admin1: address.state || address.county,
    };
  } catch {
    return {
      name: 'Current Location',
      latitude,
      longitude,
      country: '',
    };
  }
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

// logError is used in searchCities — import it lazily to keep this file focused.
// Imported here to avoid a forward declaration in the catch block above.
import { logError } from '../log';