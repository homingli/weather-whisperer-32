import { useCallback, useEffect, useState } from 'react';
import {
  GeoLocation,
  getDefaultCity,
  getRecentCities,
  getUserLocation,
  reverseGeocode,
  setDefaultCity,
} from '@/lib/weather';

/**
 * Manages the user's selected city.
 *
 * Initialization flow:
 * 1. Show saved default city weather immediately if present
 * 2. Fetch geolocation in background, swap if coords differ significantly
 *
 * Returns selected city, recent cities list, an `isLocating` flag for the
 * initial geolocation attempt, and a `handleCitySelect` callback for when
 * the user picks a different city.
 */
export function useSelectedCity() {
  const [selectedCity, setSelectedCity] = useState<GeoLocation | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [recentCities, setRecentCities] = useState<GeoLocation[]>([]);

  // Wrapped setter — any caller path (internal init or external) persists.
  const persistAndSetCity = useCallback((city: GeoLocation) => {
    setSelectedCity(city);
    setDefaultCity(city);
    setRecentCities(getRecentCities());
  }, []);

  useEffect(() => {
    const initializeLocation = async () => {
      const defaultCity = getDefaultCity();
      if (defaultCity) {
        setSelectedCity(defaultCity);
        setRecentCities(getRecentCities());
      }

      if (!defaultCity) {
        setIsLocating(true);
      }

      try {
        const coords = await getUserLocation();
        const geoLocation = await reverseGeocode(coords.latitude, coords.longitude);
        if (geoLocation) {
          const currentCity = selectedCity ?? defaultCity;
          if (
            !currentCity ||
            Math.abs(currentCity.latitude - geoLocation.latitude) > 0.01 ||
            Math.abs(currentCity.longitude - geoLocation.longitude) > 0.01
          ) {
            persistAndSetCity(geoLocation);
          }
        }
      } catch (error) {
        console.log('Could not get location:', error);
      } finally {
        setIsLocating(false);
      }
    };

    initializeLocation();
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCitySelect = useCallback((city: GeoLocation) => {
    persistAndSetCity(city);
  }, [persistAndSetCity]);

  return {
    selectedCity,
    setSelectedCity: persistAndSetCity,
    recentCities,
    isLocating,
    handleCitySelect,
  };
}
