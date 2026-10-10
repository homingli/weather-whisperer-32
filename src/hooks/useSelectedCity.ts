import { useCallback, useEffect, useState } from 'react';
import {
  GeoLocation,
  clearDeepLinkParams,
  getDefaultCity,
  getRecentCities,
  getUserLocation,
  parseDeepLinkLocation,
  reverseGeocode,
  setDefaultCity,
} from '@/lib/weather';
import { CURRENT_LOCATION_PLACEHOLDER } from '@/lib/parsers';
import { clearLastKnownWeather } from '@/lib/weather/storage';

/**
 * Manages the user's selected city.
 *
 * Initialization flow:
 * 0. A shared-location deep link (`/?lat=&lon=&name=`, built by
 *    `buildDeepLinkUrl`) wins over everything: the visitor sees the shared
 *    city immediately and is never asked for their own geolocation. Nothing
 *    is persisted — the saved default city and last-known snapshot stay
 *    untouched. The view lasts as long as the params do; picking a city
 *    clears them and returns the app to the normal flow.
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
  // Clears the cold-start weather snapshot so the new city never briefly
  // paints stale data from the previous one. Also strips deep-link params:
  // an explicit city choice must survive a refresh instead of bouncing back
  // to the shared view (no-op on a param-free URL).
  const persistAndSetCity = useCallback((city: GeoLocation) => {
    clearLastKnownWeather();
    setSelectedCity(city);
    setDefaultCity(city);
    setRecentCities(getRecentCities());
    clearDeepLinkParams();
  }, []);

  // A nameless deep link (sender had no reverse-geocoded name either) can't
  // label the place — try one reverse geocode and swap the result in when it
  // lands, unless the visitor has already moved on to another city. A
  // placeholder result leaves the name empty rather than mislabeling
  // someone else's city as "Current Location".
  const enrichDeepLinkName = useCallback((linked: GeoLocation) => {
    reverseGeocode(linked.latitude, linked.longitude)
      .then((resolved) => {
        if (!resolved || resolved.name === CURRENT_LOCATION_PLACEHOLDER) return;
        setSelectedCity((current) =>
          current &&
          current.latitude === linked.latitude &&
          current.longitude === linked.longitude
            ? resolved
            : current
        );
      })
      .catch(() => {
        // Offline or timed out — the header renders the pin alone.
      });
  }, []);

  useEffect(() => {
    const initializeLocation = async () => {
      const linked = parseDeepLinkLocation(window.location.search);
      if (linked) {
        setSelectedCity(linked);
        if (!linked.name) {
          enrichDeepLinkName(linked);
        }
        return;
      }

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
  }, [enrichDeepLinkName, persistAndSetCity]);

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
