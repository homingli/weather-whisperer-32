import { useEffect, useState, useMemo, useCallback, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { CurrentWeather } from "@/components/CurrentWeather";
import { DailyForecast } from "@/components/DailyForecast";
import { WeatherSkeleton } from "@/components/WeatherSkeleton";
import { WeatherAlerts } from "@/components/WeatherAlerts";
import { SettingsMenu } from "@/components/SettingsMenu";
import { fetchWeather } from "@/lib/weather-manager";
import { GeoLocation, getDefaultCity, getRecentCities, getUserLocation, reverseGeocode, setDefaultCity, WeatherData } from "@/lib/weather";
import { isInHongKong } from "@/lib/hko-weather";
import { useLanguage, formatString } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { CloudRain, MapPin, Download, AlertTriangle } from "lucide-react";

// Lazy load heavy components
const HourlyForecast = lazy(() => import("@/components/HourlyForecast").then(module => ({ default: module.HourlyForecast })));
const RainfallMap = lazy(() => import("@/components/RainfallMap").then(module => ({ default: module.RainfallMap })));

const Index = () => {
  const [selectedCity, setSelectedCity] = useState<GeoLocation | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [recentCities, setRecentCities] = useState<GeoLocation[]>([]);
  const { language, t } = useLanguage();
  const { setSunTimes } = useTheme();

  const handleCitySelect = useCallback((city: GeoLocation) => {
    setSelectedCity(city);
    setDefaultCity(city);
    setRecentCities(getRecentCities());
  }, []);

  useEffect(() => {
    const initializeLocation = async () => {
      // First check if there's a saved default city
      const defaultCity = getDefaultCity();
      if (defaultCity) {
        setSelectedCity(defaultCity);
        setRecentCities(getRecentCities());
        return;
      }

      // Otherwise, try to get user's current location
      setIsLocating(true);
      try {
        const coords = await getUserLocation();
        const location = await reverseGeocode(coords.latitude, coords.longitude);
        if (location) {
          setSelectedCity(location);
          setDefaultCity(location);
          setRecentCities(getRecentCities());
        }
      } catch (error) {
        console.log('Could not get location:', error);
      } finally {
        setIsLocating(false);
      }
    };

    initializeLocation();
  }, []);

  // Determine if selected city is in Hong Kong coverage area
  const isHKCovered = selectedCity ? isInHongKong(selectedCity.latitude, selectedCity.longitude) : false;
  // Note: I used the bounds from hko-weather.ts directly for simplicity in Index if I don't want to import isInHongKong
  // But I should import it.

  // Fetch unified weather data via WeatherManager
  const { data: weather, isLoading, error } = useQuery({
    queryKey: ["weather-unified", language, selectedCity?.latitude, selectedCity?.longitude],
    queryFn: async () => {
      return fetchWeather(selectedCity!.latitude, selectedCity!.longitude, language === 'tc' ? 'tc' : 'en');
    },
    enabled: !!selectedCity,
    refetchInterval: 10 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });

  // Open-Meteo daily data is always used for sunrise/sunset (HKO doesn't provide it)
  const sunTimes = useMemo(() => weather?.daily, [weather?.daily]);

  // Update theme context with sunrise/sunset times for auto mode
  useEffect(() => {
    if (sunTimes && sunTimes.length > 0) {
      const todayForecast = sunTimes[0];
      // Robustly handle both Date objects and stringified dates from cache
      const sunrise = todayForecast.sunrise instanceof Date ? todayForecast.sunrise : new Date(todayForecast.sunrise);
      const sunset = todayForecast.sunset instanceof Date ? todayForecast.sunset : new Date(todayForecast.sunset);
      
      if (!isNaN(sunrise.getTime()) && !isNaN(sunset.getTime())) {
        setSunTimes(sunrise, sunset);
      }
    }
  }, [sunTimes, setSunTimes]);

  // PWA install
  const { deferredPrompt, isInstalled, install } = usePwaInstall();

  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Freshness indicator: only show when using cached/stale data
  // Show when offline and we have cached data
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
                  <span className="text-xl font-medium text-foreground">
                    {selectedCity.name}{selectedCity.admin1 ? `, ${selectedCity.admin1}` : ''}, {selectedCity.country}
                  </span>
                  {weather?.nearestStation && (
                    <span className="text-sm px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                      {weather.nearestStation}
                    </span>
                  )}
                  {weather?.nearestDistrict && (
                    <span className="text-sm px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                      {weather.nearestDistrict}
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
          </div>
          <div className="flex items-center gap-2">
            <SettingsMenu currentCity={selectedCity} recentCities={recentCities} onCitySelect={handleCitySelect} />
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
            <WeatherSkeleton />
          ) : !weather && error ? (
            <div className="text-center py-20 glass-card">
              <p className="text-lg text-destructive mb-2">{t('loading.failed')}</p>
              <p className="text-base text-muted-foreground">{t('loading.tryAgain')}</p>
            </div>
          ) : weather ? (
            <div className="space-y-6 lg:space-y-8">
              {/* Fallback Banner */}
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

              {/* Top Row: Alerts and Hero (Full Width) */}
              <div className="space-y-6">
                {weather.warnings && weather.warnings.length > 0 && (
                  <WeatherAlerts warnings={weather.warnings} />
                )}
                
                <CurrentWeather
                  weather={weather.current}
                  hourlyForecast={weather.hourly}
                  dailyForecast={weather.daily[0]}
                  locationName={selectedCity?.name}
                  timezone={weather.timezone}
                />
              </div>

              {/* Secondary Row: Split Forecasts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-stretch">
                <Suspense fallback={<div className="h-[300px] animate-pulse bg-muted/20 rounded-xl" />}>
                  <HourlyForecast forecast={weather.hourly} daily={sunTimes} timezone={weather.timezone} />
                </Suspense>
                
                <DailyForecast forecast={weather.daily} timezone={weather.timezone} />
              </div>

              {/* Bottom Row: Optional Map */}
              {isHKCovered && (
                <Suspense fallback={<div className="h-[400px] animate-pulse bg-muted/20 rounded-xl" />}>
                  <RainfallMap />
                </Suspense>
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
