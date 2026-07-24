import { lazy, Suspense, useState } from 'react';
import { CloudRain, RefreshCw } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

// Leaflet + react-leaflet + the entire rainfall parsing pipeline are split
// into a separate chunk so the ~150 kB gz of leaflet bundle is only fetched
// once the user explicitly opts into viewing the nowcast map.
const RainfallMapInner = lazy(() => import('./RainfallMapInner'));

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
  const [isLoaded, setIsLoaded] = useState(false);
  const { t } = useLanguage();

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border/50 flex flex-wrap justify-between items-center gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <CloudRain className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold">{t('nowcast.title')}</h2>
          </div>
          <span className="text-xs text-muted-foreground">
            {t('nowcast.subtitle')}
          </span>
        </div>
      </div>

      <div className="rainfall-map-area no-swipe relative h-[min(70vh,800px)] min-h-[400px] w-full bg-muted/20">
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
          <Suspense fallback={<LoadingShell />}>
            <RainfallMapInner userLocation={userLocation} />
          </Suspense>
        )}
      </div>
    </div>
  );
};