import { lazy, Suspense, useState, useEffect, useMemo, Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { CloudRain, RefreshCw } from 'lucide-react';
import { LanguageContext, useLanguage } from '@/contexts/LanguageContext';
import { readNowcastCache } from '@/lib/nowcastCache';
import { logFailure } from '@/lib/log';

// Leaflet + react-leaflet + the entire rainfall parsing pipeline are split
// into a separate chunk so the ~150 kB gz of leaflet bundle is only fetched
// once the user explicitly opts into viewing the nowcast map.
const RainfallMapInner = lazy(() => import('./RainfallMapInner'));

/**
 * Catches lazy-chunk load failures (network error fetching the leaflet
 * bundle, Vercel edge hiccup) so the user sees a reloadable error instead
 * of a spinning LoadingShell forever. React's Suspense + lazy does NOT
 * catch these — the import promise rejection propagates up to the nearest
 * error boundary. Class component is required because Error Boundaries are
 * not yet supported by hooks.
 *
 * Once the user reloads, the lazy() module-level cache is wiped by the
 * fresh page load so the chunk re-attempts from scratch.
 */
class RainfallChunkErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    // _info.componentStack intentionally not logged — it's verbose and the
    // error itself is enough to point at the chunk import.
    logFailure('RainfallMap chunk load failed', 0, error);
  }

  handleReload = (): void => {
    // Hard reload: the only reliable way to clear the lazy() import cache
    // and force a fresh chunk fetch. location.reload() reloads the entire
    // document; the user will be back at the same scroll position on the
    // next render via the browser's bfcache / scroll-restoration.
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // LanguageContext.Consumer is used instead of the useLanguage hook
      // because hooks can't run inside class component render. The
      // Provider always wraps RainfallMap in the app tree, so ctx is
      // guaranteed non-null at this point.
      return (
        <LanguageContext.Consumer>
          {(ctx) => (
            <div className="rainfall-map-area relative h-full min-h-[400px] w-full bg-muted/20 flex flex-col items-center justify-center p-6 text-center">
              <CloudRain className="w-10 h-10 text-destructive mb-3" />
              <p className="text-base font-medium text-foreground mb-1">
                {ctx?.t('nowcast.loadFailed') ?? 'Failed to load data'}
              </p>
              <p className="text-sm text-muted-foreground mb-4 max-w-md">
                {ctx?.t('nowcast.error') ?? 'Could not load gridded rainfall data.'}
              </p>
              <button
                type="button"
                onClick={this.handleReload}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors shadow-sm font-medium"
              >
                {ctx?.t('nowcast.tryAgain') ?? 'Try Again'}
              </button>
            </div>
          )}
        </LanguageContext.Consumer>
      );
    }
    return this.props.children;
  }
}

interface UserLocation {
  latitude: number;
  longitude: number;
}

const LoadingShell = () => {
  const { t } = useLanguage();
  return (
    <div className="rainfall-map-area relative h-full min-h-[400px] w-full bg-muted/20 flex items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <RefreshCw className="w-5 h-5 animate-spin text-primary" />
        <span>{t('nowcast.downloading')}</span>
      </div>
    </div>
  );
};

export const RainfallMap = ({ userLocation }: { userLocation?: UserLocation }) => {
  // Sync cache read at mount: when the 15-min localStorage cache is fresh we
  // skip the "Load Map" prompt entirely and hand the cached CSV straight to
  // RainfallMapInner so the first render shows the parsed grid with no
  // network round-trip. Cache read is synchronous and ~50-100 ms at worst,
  // acceptable for a one-time mount cost.
  const initialCachedCsv = useMemo(() => readNowcastCache()?.csvText ?? null, []);
  const [isLoaded, setIsLoaded] = useState(initialCachedCsv !== null);
  const { t } = useLanguage();

  // Preload the lazy chunk in parallel with the React tree render when we
  // already know the user wants the map (fresh cache hit). By the time
  // Suspense mounts the inner, the chunk is usually already in memory and
  // the LoadingShell fallback never paints.
  useEffect(() => {
    if (initialCachedCsv) {
      void import('./RainfallMapInner');
    }
  }, [initialCachedCsv]);

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border/50 flex items-baseline justify-between gap-4">
        <h2 className="kicker text-muted-foreground font-display text-base">{t('nowcast.title')}</h2>
        <span className="kicker text-muted-foreground/60">{t('nowcast.stayOrGo')}</span>
      </div>

      <div
        className={`rainfall-map-area relative h-[min(70vh,800px)] min-h-[400px] w-full bg-muted/20${isLoaded ? ' no-swipe' : ''}`}
      >
        {!isLoaded ? (
          <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center bg-background/85 pointer-events-none">
            <CloudRain className="w-12 h-12 text-primary mb-4 opacity-80" />
            <h3 className="text-xl font-semibold mb-2">{t('nowcast.view')}</h3>
            <p className="text-muted-foreground mb-6 text-center max-w-lg">
              {t('nowcast.desc')}
            </p>
            <button
              type="button"
              onClick={() => setIsLoaded(true)}
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors shadow-sm font-medium pointer-events-auto"
            >
              {t('nowcast.load')}
            </button>
          </div>
        ) : (
          <RainfallChunkErrorBoundary>
            <Suspense fallback={<LoadingShell />}>
              <RainfallMapInner userLocation={userLocation} initialCsv={initialCachedCsv} />
            </Suspense>
          </RainfallChunkErrorBoundary>
        )}
      </div>
    </div>
  );
};