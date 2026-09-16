import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Top-bar connectivity chip backed by `useOnlineStatus`. Renders nothing
 * while the browser reports online; the moment it flips offline, a compact
 * amber badge appears — proactive, unlike the red cache banner in
 * WeatherBanners which only surfaces after a fetch actually fails. When
 * connectivity returns the chip disappears and React Query's default
 * `refetchOnReconnect` refetches in the background, so no refetch plumbing
 * lives here.
 *
 * role="status" (implicit aria-live=polite) so screen readers announce the
 * offline transition without interrupting (WCAG 4.1.3). Reuses the
 * `data.offline` string the cache banner uses so the two never diverge.
 */
export const OfflineIndicator = () => {
  const isOffline = useOnlineStatus();
  const { t } = useLanguage();

  if (!isOffline) return null;

  return (
    <span
      role="status"
      data-testid="offline-indicator"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-severity-warning/15 px-2.5 py-1 text-xs font-medium text-severity-warning"
    >
      <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
      {t('data.offline')}
    </span>
  );
};
