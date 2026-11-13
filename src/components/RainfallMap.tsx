import { lazy, Suspense, useState, useEffect, useMemo } from 'react';
import { CloudRain, RefreshCw } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { readNowcastCache } from '@/lib/nowcastCache';
import { ChunkErrorBoundary } from './ChunkErrorBoundary';
import type { UserLocation } from './NowcastMapShared';

// MapLibre + the entire rainfall parsing pipeline are split
// into a separate chunk so the map bundle is only fetched
// once the user explicitly opts into viewing the nowcast map.
const RainfallMapInner = lazy(() => import('./RainfallMapInner'));

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
  // skip the "Load Map" prompt entirely and hand the cached sparse rows
  // straight to RainfallMapInner so the first render shows the parsed grid
  // with no network round-trip. Cache read is synchronous and ~50-100 ms at
  // worst (v3 reads small rain-only rows — no 58k-line CSV re-parse),
  // acceptable for a one-time mount cost.
  const initialNowcast = useMemo(() => readNowcastCache(), []);
  const [isLoaded, setIsLoaded] = useState(initialNowcast !== null);
  const { t } = useLanguage();

  // Preload the lazy chunk in parallel with the React tree render when we
  // already know the user wants the map (fresh cache hit). By the time
  // Suspense mounts the inner, the chunk is usually already in memory and
  // the LoadingShell fallback never paints.
  useEffect(() => {
    if (initialNowcast) {
      void import('./RainfallMapInner');
    }
  }, [initialNowcast]);

  return (
    <div className="editorial-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border/50 flex items-baseline justify-between gap-4">
        <h2 className="kicker text-muted-foreground font-display leading-6">{t('nowcast.title')}</h2>
        <span className="kicker text-muted-foreground/60">{t('nowcast.stayOrGo')}</span>
      </div>

      <div
        className={`rainfall-map-area relative h-[min(70vh,800px)] min-h-[400px] w-full bg-muted/20${isLoaded ? ' no-swipe' : ''}`}
      >
        {!isLoaded ? (
          <div className="absolute inset-0 z-1000 flex flex-col items-center justify-center bg-background/85 pointer-events-none">
            <CloudRain className="w-12 h-12 text-primary mb-4 opacity-80" />
            <h3 className="text-xl font-semibold mb-2">{t('nowcast.view')}</h3>
            <p className="text-muted-foreground mb-6 text-center max-w-lg">
              {t('nowcast.desc')}
            </p>
            <button
              type="button"
              onClick={() => setIsLoaded(true)}
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors shadow-xs font-medium pointer-events-auto"
            >
              {t('nowcast.load')}
            </button>
          </div>
        ) : (
          <ChunkErrorBoundary logLabel="RainfallMap chunk load failed">
            <Suspense fallback={<LoadingShell />}>
              <RainfallMapInner userLocation={userLocation} initialNowcast={initialNowcast} />
            </Suspense>
          </ChunkErrorBoundary>
        )}
      </div>
    </div>
  );
};
