import { useMemo, useCallback, lazy, Suspense, useEffect } from 'react';
import { CurrentWeather } from '@/components/CurrentWeather';
import { DailyForecast } from '@/components/DailyForecast';
import { WeatherAlerts } from '@/components/WeatherAlerts';
import { SettingsMenu } from '@/components/SettingsMenu';
import { RainfallMap } from '@/components/RainfallMap';
import { FetchingStatus } from '@/components/FetchingStatus';
import { WeatherBanners } from '@/components/WeatherBanners';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useSelectedCity } from '@/hooks/useSelectedCity';
import { useWeatherWithProgress } from '@/hooks/useWeatherWithProgress';
import { isInHongKong, isInRainfallRegion, translateStationName, translateDistrictName } from '@/lib/hko-weather';
import { PLACEHOLDER_SENTINEL } from '@/lib/constants';
import { useLanguage, formatString } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { CloudRain, MapPin, Download } from 'lucide-react';

// Lazy load heavy components
const HourlyForecast = lazy(() => import('@/components/HourlyForecast').then(module => ({ default: module.HourlyForecast })));

// Placeholder used when weather.current is null during transitions
// All display values set to PLACEHOLDER_SENTINEL so CurrentWeather shows `-` instead of 0
const PLACEHOLDER_CURRENT = {
  temperature: PLACEHOLDER_SENTINEL,
  apparentTemperature: PLACEHOLDER_SENTINEL,
  humidity: PLACEHOLDER_SENTINEL,
  uvIndex: PLACEHOLDER_SENTINEL,
  windSpeed: PLACEHOLDER_SENTINEL,
  windDirection: 0,
  precipitation: 0,
  precipitationProbability: 0,
  isDay: false,
  weatherCode: 3,
};

const Index = () => {
  const { language, t } = useLanguage();
  const { setSunTimes } = useTheme();
  const isOffline = useOnlineStatus();
  const { selectedCity, recentCities, isLocating, handleCitySelect } = useSelectedCity();
  const { data: weather, isLoading, error, refetch, isFetching, loadProgress } = useWeatherWithProgress(
    selectedCity?.latitude,
    selectedCity?.longitude,
    language === 'tc' ? 'tc' : 'en',
  );

  const handleForceRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // Open-Meteo daily data is always used for sunrise/sunset (HKO doesn't provide it)
  const sunTimes = useMemo(() => weather?.daily, [weather?.daily]);

  // Update theme context with sunrise/sunset times for auto mode
  useEffect(() => {
    if (sunTimes && sunTimes.length > 0) {
      const todayForecast = sunTimes[0];
      const sunrise = todayForecast.sunrise instanceof Date ? todayForecast.sunrise : new Date(todayForecast.sunrise);
      const sunset = todayForecast.sunset instanceof Date ? todayForecast.sunset : new Date(todayForecast.sunset);

      if (!isNaN(sunrise.getTime()) && !isNaN(sunset.getTime())) {
        setSunTimes(sunrise, sunset);
      }
    }
  }, [sunTimes, setSunTimes]);

  // PWA install
  const { deferredPrompt, isInstalled, install } = usePwaInstall();

  // Determine if selected city is in Hong Kong coverage area
  const isHKCovered = selectedCity ? isInHongKong(selectedCity.latitude, selectedCity.longitude) : false;

  // Freshness indicator: only show when using cached/stale data
  const cacheLabel = isOffline && !isLoading && weather
    ? t('data.usingCached')
    : null;

  return (
    <div className="min-h-screen gradient-sky">
      <div className="w-full max-w-2xl lg:max-w-5xl xl:max-w-7xl mx-auto px-4 pt-[10px] pb-8 transition-all duration-300">
        {/* Top bar: location + settings */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-muted-foreground flex-wrap">
            {selectedCity && (
              <>
                <MapPin className="h-6 w-6 shrink-0" />
                <div className="flex items-center flex-wrap gap-2">
                  {isHKCovered ? (
                    weather?.nearestStation && (
                      <span className="text-xl font-medium text-foreground">
                        {translateStationName(weather.nearestStation, language === 'tc' ? 'tc' : 'en')}
                      </span>
                    )
                  ) : (
                    <span className="text-xl font-medium text-foreground">
                      {selectedCity.name}{selectedCity.admin1 ? `, ${selectedCity.admin1}` : ''}, {selectedCity.country}
                    </span>
                  )}
                  {weather?.nearestDistrict && (
                    <span className="text-sm px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                      {translateDistrictName(weather.nearestDistrict, language === 'tc' ? 'tc' : 'en')}
                    </span>
                  )}
                </div>
              </>
            )}
            {cacheLabel && (
              <div className="ml-2 text-sm text-muted-foreground" aria-label="data-freshness">
                {cacheLabel}
              </div>
            )}
            {isFetching && weather && !isLoading && (
              <div className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground" aria-label="refreshing-data">
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                <span>Refreshing...</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {weather?.warnings && weather.warnings.length > 0 && (
              <WeatherAlerts warnings={weather.warnings} />
            )}
            <SettingsMenu currentCity={selectedCity} recentCities={recentCities} onCitySelect={handleCitySelect} onRefresh={handleForceRefresh} />
            {deferredPrompt && !isInstalled && (
              <button
                onClick={install}
                className="h-9 px-3 flex items-center gap-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                title="Install app"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Install</span>
              </button>
            )}
          </div>
        </div>

        {/* Screen reader only header */}
        <h1 className="sr-only">Weather Forecast</h1>

        {/* Main content */}
        <main className="w-full">
          {isLocating ? (
            <div className="text-center py-20 animate-fade-in">
              <CloudRain className="h-20 w-20 mx-auto mb-4 text-primary" />
              <h2 className="text-3xl font-semibold mb-2">{t('loading.findingLocation')}</h2>
              <p className="text-lg text-muted-foreground">
                {t('loading.allowLocation')}
              </p>
            </div>
          ) : !selectedCity ? (
            <div className="text-center py-20 animate-fade-in">
              <CloudRain className="h-20 w-20 mx-auto mb-4 text-primary" />
              <h2 className="text-3xl font-semibold mb-2">{t('loading.welcome')}</h2>
              <p className="text-lg text-muted-foreground">
                {t('loading.searchPrompt')}
              </p>
            </div>
          ) : isLoading ? (
            <FetchingStatus loadProgress={loadProgress} isHKCovered={isHKCovered} />
          ) : !weather && error ? (
            <div className="text-center py-20 glass-card">
              <p className="text-lg text-destructive mb-2">{t('loading.failed')}</p>
              <p className="text-base text-muted-foreground">{t('loading.tryAgain')}</p>
            </div>
          ) : weather ? (
            <div className="space-y-6 lg:space-y-8 animate-fade-in">
              <WeatherBanners weather={weather} isHKCovered={isHKCovered} />

              {/* Top Row: Hero (Full Width) */}
              <div className="space-y-6">
                <CurrentWeather
                  weather={weather.current ?? PLACEHOLDER_CURRENT}
                  hourlyForecast={weather.hourly || []}
                  dailyForecast={weather?.daily?.[0]}
                  locationName={selectedCity?.name}
                  timezone={weather.timezone}
                />
              </div>

              {/* Secondary Row: Split Forecasts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-stretch">
                <Suspense fallback={<div className="h-[300px] animate-pulse bg-muted/20 rounded-xl" />}>
                  <HourlyForecast forecast={weather.hourly || []} daily={sunTimes || []} timezone={weather.timezone} />
                </Suspense>

                <DailyForecast forecast={weather.daily || []} timezone={weather.timezone} />
              </div>

              {/* Bottom Row: Optional Map — only available for the Pearl River Delta region (HK + Guangdong) */}
              {selectedCity && isInRainfallRegion(selectedCity.latitude, selectedCity.longitude) && (
                <RainfallMap userLocation={{ latitude: selectedCity.latitude, longitude: selectedCity.longitude }} />
              )}
            </div>
          ) : null}
        </main>

        {/* Footer */}
        <footer className="text-center mt-12 text-sm text-muted-foreground">
          <p>
            {isHKCovered
              ? formatString(t('source.poweredByBoth'), t('source.openMeteo'), t('source.hko'))
              : formatString(t('source.poweredBy'), t('source.openMeteo'))
            }
          </p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
