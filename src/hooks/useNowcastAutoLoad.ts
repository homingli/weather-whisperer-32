import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isInRainfallRegion } from '@/lib/hko-bounds';
import { TIMING } from '@/lib/constants';
import { fetchLocalRainNowcast, localNowcastQueryKey } from '@/lib/nowcastLocal';

/**
 * Auto-load the district-scale rain nowcast (nowcastLocal.ts) for the
 * selected city. The gridded nowcast used to be opt-in — the rain map's
 * "Load Map" button — because the source CSV is ~2.7 MB; the KB-sized crop
 * makes district-accurate 0–2 h rain affordable for every in-region session,
 * so this hook arms a fetch after first paint + idle and keeps it fresh on
 * the same 15-min TTL cadence as the map's query.
 *
 * Failure is silent by design: no cache entry → the rain-start banner runs
 * on Open-Meteo / the full-domain grid exactly as before the auto-load
 * existed. Dev has no serverless functions (the Vite proxy only serves the
 * map's mode=full stream), so local dev always takes the fallback path.
 */
export function useNowcastAutoLoad(latitude?: number, longitude?: number) {
  const [armed, setArmed] = useState(false);
  const inRegion =
    latitude !== undefined && longitude !== undefined && isInRainfallRegion(latitude, longitude);

  // Arm after first paint + idle: hero, charts and the banner render first;
  // a KB fetch never justifies competing with them. The idle timeout bounds
  // the wait — on a busy main thread the fetch still starts within 5 s.
  useEffect(() => {
    if (!inRegion) return;
    if (window.requestIdleCallback) {
      const id = window.requestIdleCallback(() => setArmed(true), { timeout: 5000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(() => setArmed(true), 1500);
    return () => clearTimeout(id);
  }, [inRegion]);

  useQuery({
    // The key must exist before lat/lon do (no city yet); the enabled gate
    // keeps the placeholder entry from ever fetching.
    queryKey:
      latitude !== undefined && longitude !== undefined
        ? localNowcastQueryKey(latitude, longitude)
        : ['hkoLocalRainNowcast', 'no-city'],
    queryFn: ({ signal }) => fetchLocalRainNowcast(latitude!, longitude!, signal),
    enabled: armed && inRegion,
    // 15-min TTL aligned with the map query and the HKO generation cadence.
    staleTime: TIMING.NOWCAST_CACHE_TTL_MS,
    refetchInterval: (query) => {
      const cachedAt = query.state.dataUpdatedAt;
      if (!cachedAt) return TIMING.NOWCAST_CACHE_TTL_MS;
      // Floor at the failure-retry cadence: after a failed refresh with
      // existing data the raw delta goes negative, and React Query would
      // refetch immediately — an always-on hot loop against a failing
      // endpoint for every in-region tab during an outage.
      return Math.max(
        cachedAt + TIMING.NOWCAST_CACHE_TTL_MS - Date.now(),
        TIMING.REFETCH_ON_FAILURE_MS,
      );
    },
    retry: 1,
    retryDelay: 1000,
  });
}
