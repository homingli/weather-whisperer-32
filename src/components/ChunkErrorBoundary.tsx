import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { CloudRain } from 'lucide-react';
import { LanguageContext } from '@/contexts/language-context';
import { logFailure } from '@/lib/log';

/**
 * Catches lazy-chunk load failures (network error fetching the MapLibre
 * bundle, Vercel edge hiccup) so the user sees a reloadable error instead
 * of a spinning loading shell forever. React's Suspense + lazy does NOT
 * catch these — the import promise rejection propagates up to the nearest
 * error boundary. Class component is required because Error Boundaries are
 * not yet supported by hooks.
 *
 * Once the user reloads, the lazy() module-level cache is wiped by the
 * fresh page load so the chunk re-attempts from scratch.
 *
 * Used by both nowcast maps (HKO RainfallMap, MSC MSCRainfallMap); pass
 * `logLabel` so the logged failure names the map that dropped.
 */
export class ChunkErrorBoundary extends Component<
  { children: ReactNode; logLabel: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    // _info.componentStack intentionally not logged — it's verbose and the
    // error itself is enough to point at the chunk import.
    logFailure(this.props.logLabel, 0, error);
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
      // LanguageContext.Consumer instead of the useLanguage hook because
      // hooks can't run inside class component render. The Provider wraps
      // both maps in the app tree, but the ctx?. guards keep the error UI
      // renderable even if this boundary ever mounts outside the provider.
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
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors shadow-xs font-medium"
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
