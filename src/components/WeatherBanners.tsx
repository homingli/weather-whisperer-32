import { AlertTriangle } from 'lucide-react';
import { WeatherData } from '@/lib/weather';
import { useLanguage } from '@/contexts/LanguageContext';

interface WeatherBannersProps {
  weather: WeatherData;
  isHKCovered: boolean;
}

/** Warning banners for fallback mode and HKO failures. */
export function WeatherBanners({ weather, isHKCovered }: WeatherBannersProps) {
  const { t } = useLanguage();

  return (
    <>
      {weather.isFallback && (
        <div className="glass-card border-amber-500/20 bg-amber-500/5 p-4 rounded-xl flex items-start gap-3 text-amber-600 dark:text-amber-400 animate-fade-in">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-sm">
              {weather.fallbackSource === 'HKO'
                ? t('fallback.hkoTitle')
                : t('fallback.cacheTitle')}
            </h4>
            <p className="text-xs opacity-90 mt-1">
              {weather.fallbackSource === 'HKO'
                ? t('fallback.hkoDesc')
                : t('fallback.cacheDesc')}
            </p>
          </div>
        </div>
      )}

      {weather.hkoFailed && !weather.isFallback && isHKCovered && (
        <div className="glass-card border-amber-500/20 bg-amber-500/5 p-4 rounded-xl flex items-start gap-3 text-amber-600 dark:text-amber-400 animate-fade-in">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-sm">{t('fallback.hkoFailedTitle')}</h4>
            <p className="text-xs opacity-90 mt-1">{t('fallback.hkoFailedDesc')}</p>
          </div>
        </div>
      )}
    </>
  );
}
