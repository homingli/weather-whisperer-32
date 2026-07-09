import { CloudRain } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { StatusBadge } from './StatusBadge';
import { LoadProgress } from '@/hooks/useWeatherWithProgress';

interface FetchingStatusProps {
  loadProgress: LoadProgress;
  isHKCovered: boolean;
}

/** In-progress loading screen showing per-source fetch status (Open-Meteo + HKO). */
export function FetchingStatus({ loadProgress, isHKCovered }: FetchingStatusProps) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
      <div className="glass-card p-8 border border-primary/10 w-full max-w-lg flex flex-col items-center gap-6">
        {/* Animated cloud icon */}
        <div className="relative">
          <CloudRain className="h-16 w-16 text-primary animate-pulse" />
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-4 w-4 bg-primary" />
          </span>
        </div>

        {/* Title */}
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-foreground mb-1">
            {t('loading.fetchingData')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('loading.allowLocation')}
          </p>
        </div>

        {/* Source status rows */}
        <div className="w-full space-y-3">
          <div className="flex items-center justify-between p-4 rounded-lg bg-black/5 dark:bg-white/5 border border-border/20">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground">{t('source.openMeteo')}</span>
              <span className="text-xs text-muted-foreground">{t('source.openMeteoDesc')}</span>
            </div>
            <StatusBadge status={loadProgress.openMeteo} />
          </div>

          {isHKCovered && (
            <div className="flex items-center justify-between p-4 rounded-lg bg-black/5 dark:bg-white/5 border border-border/20">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">{t('source.hko')}</span>
                <span className="text-xs text-muted-foreground">{t('source.hkoDesc')}</span>
              </div>
              <StatusBadge status={loadProgress.hko} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
