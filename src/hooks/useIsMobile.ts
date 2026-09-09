import { useSyncExternalStore } from 'react';

/**
 * Shared mobile-breakpoint subscription. Three components (Index, the HKO
 * map, the MSC map) previously registered their own `matchMedia` +
 * `addEventListener('change')` pair for the same 1080px query, so the
 * browser held three independent MediaQueryList listeners. This hook keeps
 * ONE module-level MediaQueryList and refcounts a single change listener:
 * the first subscriber attaches it, the last subscriber detaches it.
 *
 * The snapshot is a boolean so React bails out of re-rendering consumers
 * whose layout class didn't actually flip.
 */

const MOBILE_BREAKPOINT_QUERY = '(max-width: 1080px)';

let mql: MediaQueryList | undefined;

function getMql(): MediaQueryList | null {
  if (typeof window === 'undefined') return null;
  // Create once per module load; matchMedia returns a live object whose
  // `.matches` tracks the viewport, so caching it is safe.
  mql ??= window.matchMedia(MOBILE_BREAKPOINT_QUERY);
  return mql;
}

const subscribers = new Set<() => void>();

function handleChange(): void {
  for (const listener of subscribers) listener();
}

function subscribe(onStoreChange: () => void): () => void {
  const media = getMql();
  if (!media) return () => {};
  subscribers.add(onStoreChange);
  if (subscribers.size === 1) media.addEventListener('change', handleChange);
  return () => {
    subscribers.delete(onStoreChange);
    if (subscribers.size === 0) media.removeEventListener('change', handleChange);
  };
}

function getSnapshot(): boolean {
  return getMql()?.matches ?? false;
}

function getServerSnapshot(): boolean {
  return false;
}

/** True when the viewport is at or below the mobile breakpoint (1080px). */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
