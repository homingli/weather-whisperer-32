// Lightweight cache helpers — only force-refresh and city data.
// All TTL caching is handled by React Query (staleTime / refetchInterval).

const WEATHER_KEYS = [
  'weather_combined_',
  'weather_openmeteo_',
  'weather_hko_',
];

export const cache = {
  /** Force-clear all weather API cache entries (used for manual refresh) */
  clearWeather: () => {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && WEATHER_KEYS.some(prefix => key.startsWith(prefix))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  },
};
