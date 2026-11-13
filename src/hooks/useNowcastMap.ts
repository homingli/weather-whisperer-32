import { useCallback, useEffect, useRef, useState } from 'react';
import type { Map } from 'maplibre-gl';
import { useTheme } from '@/contexts/ThemeContext';
import { TIMING } from '@/lib/constants';

/**
 * Behaviour shared by the HKO and MSC nowcast maps. Each hook keeps the
 * exact semantics the two components had before extraction; the components
 * stay responsible for what differs (data pipeline, gating conditions).
 */

/**
 * Autoplay the timeline: call `onTick` every RAINFALL_AUTOPLAY_MS while
 * playing and steps exist. `onTick` lives in a ref so a changing closure
 * doesn't restart the interval.
 */
export function useAutoplayStep(isPlaying: boolean, stepCount: number, onTick: () => void) {
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  useEffect(() => {
    if (!isPlaying || stepCount <= 0) return;
    const id = setInterval(() => onTickRef.current(), TIMING.RAINFALL_AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [isPlaying, stepCount]);
}

/**
 * Slow-network flag: turns true after the load state has held for
 * NOWCAST_SLOW_CHIP_MS, resets the moment it clears (success OR failure —
 * the error overlay / stale pill takes over from there).
 */
export function useSlowFlag(isLoading: boolean) {
  const [isSlow, setIsSlow] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setIsSlow(false);
      return;
    }
    const id = setTimeout(() => setIsSlow(true), TIMING.NOWCAST_SLOW_CHIP_MS);
    return () => clearTimeout(id);
  }, [isLoading]);
  return isSlow;
}

/**
 * Map basemap light/dark toggle that defaults to the app theme. The toggle
 * lets the user flip it independently; re-aligns whenever the app theme
 * changes.
 */
export function useBasemapDark() {
  const [basemapIsDark, setBasemapIsDark] = useState(false);
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    setBasemapIsDark(resolvedTheme === 'dark');
  }, [resolvedTheme]);
  const toggleBasemap = useCallback(() => setBasemapIsDark(v => !v), []);
  return { basemapIsDark, toggleBasemap };
}

/**
 * Ref plumbing for the map instance: reapplies the interactive-handler lock
 * state and keeps a ResizeObserver on the map container so it resizes with
 * the viewport.
 *
 * `ready` = the map's data has rendered and panning is safe. The lock is
 * applied when MapLibreMap calls `onMap` with a new instance (creation and
 * theme rebuild). Re-apply on later `ready` changes is NOT driven by this
 * callback — MapLibreMap only calls `onMap` from its [dark] effect — but by
 * MapLibreMap's `interactive` prop effect, which both maps keep in sync
 * with this hook's `ready`. The onMap path still matters for the cache
 * path: with initialData, [data, isLoading] don't change after mount, so a
 * lock applied in an effect would have run with mapRef.current still null;
 * applying at map creation gets it right on the first try.
 *
 * The RAF + ResizeObserver dance closes the "blank map on mobile" race:
 * MapLibre's constructor reads the container's bounding rect synchronously,
 * so a map mounted against a 0x0 container (Swiper slide transition, iOS
 * Safari URL-bar mid-transition) is built with a 0x0 viewport that never
 * self-repairs. invalidateSize() on the next frame re-reads the settled
 * size; the observer covers in-session changes. Disconnect on detach so the
 * observer doesn't pin the dead container node in memory.
 */
export function useMapLockRef(ready: boolean) {
  const mapRef = useRef<Map | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const applyMapLockState = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const fn of ['dragPan', 'scrollZoom', 'doubleClickZoom', 'boxZoom', 'keyboard'] as const) {
      if (ready) map[fn].enable();
      else map[fn].disable();
    }
  }, [ready]);

  const handleMapRef = useCallback(
    (map: Map | null) => {
      mapRef.current = map;
      if (map) {
        applyMapLockState();
        // RAF so the container has its settled size (mount-time race).
        requestAnimationFrame(() => {
          map.resize();
        });
        // Replace any prior observer from a previous identity of this
        // ref callback — disconnects the old one, observes the new map.
        resizeObserverRef.current?.disconnect();
        const observer = new ResizeObserver(() => map.resize());
        observer.observe(map.getContainer());
        resizeObserverRef.current = observer;
      } else {
        resizeObserverRef.current?.disconnect();
        resizeObserverRef.current = null;
      }
    },
    [applyMapLockState],
  );

  return { mapRef, handleMapRef };
}
