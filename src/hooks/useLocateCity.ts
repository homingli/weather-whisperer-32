import { useState } from 'react';
import { useLanguage, formatString } from '@/contexts/LanguageContext';
import { getUserLocation, reverseGeocode, type GeoLocation } from '@/lib/weather';
import { logWarn } from '@/lib/log';
import { toast } from 'sonner';

/**
 * Shared "use my location" flow: browser geolocation → reverse geocode →
 * hand the resolved city to the caller. Used by both the landing empty-state
 * CitySearch and the SettingsMenu location refresh so the two entry points
 * can't drift (they did once; HML-58 review round 3).
 *
 * Returns an in-flight flag for spinner/disabled state. Failures — permission
 * denied, timeout, or a null reverse lookup — surface as an error toast and
 * leave the caller usable for another attempt.
 */
export function useLocateCity(onLocate: (city: GeoLocation) => void) {
  const { t } = useLanguage();
  const [isLocating, setIsLocating] = useState(false);

  const locate = async () => {
    if (isLocating) return;
    setIsLocating(true);
    try {
      const coords = await getUserLocation();
      const location = await reverseGeocode(coords.latitude, coords.longitude);
      if (location) {
        onLocate(location);
        toast.success(formatString(t('search.locationUpdated'), location.name));
      } else {
        // reverseGeocode can return null (reverse lookup found nothing);
        // surface that instead of silently no-oping the button press.
        toast.error(t('search.locationError'));
      }
    } catch (error) {
      // Browser geolocation and reverse-geocode failures (permission
      // denied, timeout, unavailable) don't go through the fetch layer,
      // so log here.
      logWarn('[locate-city] failed', error);
      toast.error(t('search.locationError'));
    } finally {
      setIsLocating(false);
    }
  };

  return { isLocating, locate };
}
