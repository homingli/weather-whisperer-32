import { lazy, Suspense } from 'react';
import { CloudRain } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { ChunkErrorBoundary } from './ChunkErrorBoundary';
import type { UserLocation } from './NowcastMapShared';

// The MSC map pulls MapLibre into the lazy chunk so the map bundle is only fetched
// when the nowcast map renders. Unlike the HKO map there is NO "Load Map"
// prompt: MSC serves small cached WMS tiles (not a 2.7 MB CSV), so the map
// auto-loads when the section renders (user decision 2026-08-07, FR-001).
const MSCRainfallMapInner = lazy(() => import('./MSCRainfallMapInner'));

const LoadingShell = () => {
  const { t } = useLanguage();
  return (
    <div className="rainfall-map-area relative h-full min-h-[400px] w-full bg-muted/20 flex items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <CloudRain className="w-5 h-5 animate-pulse text-primary" />
        <span>{t('nowcast.downloading')}</span>
      </div>
    </div>
  );
};

export const MSCRainfallMap = ({ userLocation }: { userLocation?: UserLocation }) => {
  const { t } = useLanguage();

  return (
    <div className="editorial-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border/50 flex items-baseline justify-between gap-4">
        <h2 className="kicker text-muted-foreground font-display leading-6">{t('nowcast.title')}</h2>
        <span className="kicker text-muted-foreground/60">{t('nowcast.stayOrGo')}</span>
      </div>

      <div className="rainfall-map-area relative h-[min(70vh,800px)] min-h-[400px] w-full bg-muted/20 no-swipe">
        <ChunkErrorBoundary logLabel="MSC map chunk load failed">
          <Suspense fallback={<LoadingShell />}>
            <MSCRainfallMapInner userLocation={userLocation} />
          </Suspense>
        </ChunkErrorBoundary>
      </div>
    </div>
  );
};
