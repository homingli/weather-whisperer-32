import { lazy, Suspense, Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { CloudRain } from 'lucide-react';
import { LanguageContext, useLanguage } from '@/contexts/LanguageContext';
import { logFailure } from '@/lib/log';

// The MSC map pulls MapLibre into the lazy chunk so the map bundle is only fetched
// when the nowcast map renders. Unlike the HKO map there is NO "Load Map"
// prompt: MSC serves small cached WMS tiles (not a 2.7 MB CSV), so the map
// auto-loads when the section renders (user decision 2026-08-07, FR-001).
const MSCRainfallMapInner = lazy(() => import('./MSCRainfallMapInner'));

/**
 * Catches lazy-chunk load failures (network error fetching the MapLibre
 * bundle, Vercel edge hiccup) so the user sees a reloadable error instead
 * of a spinning LoadingShell forever. Class component because Error
 * Boundaries are not yet supported by hooks.
 */
class MSCChunkErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    logFailure('MSC map chunk load failed', 0, error);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
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
        <CloudRain className="w-5 h-5 animate-pulse text-primary" />
        <span>{t('nowcast.downloading')}</span>
      </div>
    </div>
  );
};

export const MSCRainfallMap = ({ userLocation }: { userLocation?: UserLocation }) => {
  const { t } = useLanguage();

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border/50 flex items-baseline justify-between gap-4">
        <h2 className="kicker text-muted-foreground font-display text-base">{t('nowcast.title')}</h2>
        <span className="kicker text-muted-foreground/60">{t('nowcast.stayOrGo')}</span>
      </div>

      <div className="rainfall-map-area relative h-[min(70vh,800px)] min-h-[400px] w-full bg-muted/20 no-swipe">
        <MSCChunkErrorBoundary>
          <Suspense fallback={<LoadingShell />}>
            <MSCRainfallMapInner userLocation={userLocation} />
          </Suspense>
        </MSCChunkErrorBoundary>
      </div>
    </div>
  );
};
