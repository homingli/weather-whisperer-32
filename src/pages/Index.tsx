import { useEffect, useState, useMemo, useCallback, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { CurrentWeather } from "@/components/CurrentWeather";
import { DailyForecast } from "@/components/DailyForecast";
import { WeatherAlerts } from "@/components/WeatherAlerts";
import { SettingsMenu } from "@/components/SettingsMenu";
import { fetchWeather } from "@/lib/weather-manager";
import { GeoLocation, getDefaultCity, getRecentCities, getUserLocation, reverseGeocode, setDefaultCity, WeatherData } from "@/lib/weather";
import { cache } from "@/lib/cache";
import { isInHongKong, isInRainfallRegion, translateStationName, translateDistrictName } from "@/lib/hko-weather";
import { PLACEHOLDER_SENTINEL } from "@/lib/constants";
import { useLanguage, formatString } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { CloudRain, MapPin, Download, AlertTriangle } from "lucide-react";

// Lazy load heavy components
const HourlyForecast = lazy(() => import("@/components/HourlyForecast").then(module => ({ default: module.HourlyForecast })));
const RainfallMap = lazy(() => import("@/components/RainfallMap").then(module => ({ default: module.RainfallMap })));

// Placeholder used when weather.current is null during transitions
// All display values set to PLACEHOLDER_SENTINEL so CurrentWeather shows `-` instead of 0
const PLACEHOLDER_CURRENT = { temperature: PLACEHOLDER_SENTINEL, apparentTemperature: PLACEHOLDER_SENTINEL, humidity: PLACEHOLDER_SENTINEL, uvIndex: PLACEHOLDER_SENTINEL, windSpeed: PLACEHOLDER_SENTINEL, windDirection: 0, precipitation: 0, precipitationProbability: 0, isDay: false, weatherCode: 3 };

const Index = () => {
  const [selectedCity, setSelectedCity] = useState<GeoLocation | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [recentCities, setRecentCities] = useState<GeoLocation[]>([]);
  const { language, t } = useLanguage();
  const [loadProgress, setLoadProgress] = useState<{
    openMeteo: 'idle' | 'fetching' | 'success' | 'error';
    hko: 'idle' | 'fetching' | 'success' | 'error';
  }>({ openMeteo: 'idle', hko: 'idle' });

  const renderStatusBadge = (status: 'idle' | 'fetching' | 'success' | 'error') => {
    switch (status) {
      case 'fetching':
        return (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
            Fetching...
          </span>
        );
      case 'success':
        return (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            Success
          </span>
        );
      case 'error':
        return (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
            Error
          </span>
        );
      default:
        return (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
            Waiting...
          </span>
        );
    }
  };
  const { setSunTimes } = useTheme();
  const [hasFailure, setHasFailure] = useState(false);

  const handleCitySelect = useCallback((city: GeoLocation) => {
    setSelectedCity(city);
    setDefaultCity(city);
    setRecentCities(getRecentCities());
  }, []);

  // Clear stale custom cache entries left over from the previous cache layer.
  // The old cache stored raw Open-Meteo API responses (flat shape, no `current` wrapper)
  // that are incompatible with the current `WeatherData` shape expected by the UI.
  // Version-gated: only runs once to avoid nuking new-format cache on subsequent mounts.
  useEffect(() => {
    if (!localStorage.getItem('cache_migrated_v2')) {
      cache.clearWeather();
      localStorage.setItem('cache_migrated_v2', '1');
    }
  }, []);

  // Dual-fetch location initialization (Option C):
  // 1. Show saved default city weather immediately
  // 2. Fetch geolocation in background, swap if different
  useEffect(() => {
    const initializeLocation = async () => {
      const defaultCity = getDefaultCity();
      if (defaultCity) {
        setSelectedCity(defaultCity);
        setRecentCities(getRecentCities());
        // Still try to get geo location in background
      }

      if (!defaultCity) {
        setIsLocating(true);
      }

      try {
        const coords = await getUserLocation();
        const geoLocation = await reverseGeocode(coords.latitude, coords.longitude);
        if (geoLocation) {
            // Only swap if significantly different from saved default
            // Use approximate comparison (~1km tolerance) to avoid unnecessary
            // query key changes from float-precision coordinate differences
            const currentCity = selectedCity ?? defaultCity;
            if (
              !currentCity ||
              Math.abs(currentCity.latitude - geoLocation.latitude) > 0.01 ||
              Math.abs(currentCity.longitude - geoLocation.longitude) > 0.01
            ) {
              setSelectedCity(geoLocation);
              setDefaultCity(geoLocation);
              setRecentCities(getRecentCities());
            }
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

  // Fetch unified weather data via WeatherManager
  // - keepPreviousData: smooth transition when city swaps (geo vs default)
  // - staleTime 5 min + refetchInterval 5 min: consistent caching
  // - No custom cache layer — React Query handles all TTL/dedup
  const { data: weather, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["weather-unified", language, selectedCity?.latitude, selectedCity?.longitude],
    queryFn: async () => {
      setLoadProgress({
        openMeteo: 'fetching',
        hko: isInHongKong(selectedCity!.latitude, selectedCity!.longitude) ? 'fetching' : 'idle'
      });
      return fetchWeather(
        selectedCity!.latitude,
        selectedCity!.longitude,
        language === 'tc' ? 'tc' : 'en',
        (service, status) => {
          setLoadProgress(prev => ({ ...prev, [service]: status }));
        }
      );
    },
    enabled: !!selectedCity,
    refetchInterval: hasFailure ? 60 * 1000 : 5 * 60 * 1000,
    staleTime: hasFailure ? 60 * 1000 : 5 * 60 * 1000,
    placeholderData: 'keepPreviousData',
  });

  useEffect(() => {
    if (weather) {
      setHasFailure(!!(weather.hkoFailed || weather.isFallback));
    } else {
      setHasFailure(false);
    }
  }, [weather]);

  const handleForceRefresh = useCallback(async () => {
    // Force a fresh network fetch via React Query invalidate
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
                      {translateStationName(weather.nearestStation, language === 'tc' ? 'tc' : 'en')}
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
            <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
              {/* Fetching Status Screen */}
              <div className="glass-card p-8 border border-primary/10 w-full max-w-lg flex flex-col items-center gap-6">
                {/* Animated cloud icon */}
                <div className="relative">
                  <CloudRain className="h-16 w-16 text-primary animate-pulse" />
                  <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-primary"></span>
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

                {/* Source Status Rows */}
                <div className="w-full space-y-3">
                  {/* Open-Meteo Status */}
                  <div className="flex items-center justify-between p-4 rounded-lg bg-black/5 dark:bg-white/5 border border-border/20">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">{t('source.openMeteo')}</span>
                        <span className="text-xs text-muted-foreground">{t('source.openMeteoDesc')}</span>
                      </div>
                    </div>
                    {renderStatusBadge(loadProgress.openMeteo)}
                  </div>

                  {/* HKO Status (Only if within HK coverage) */}
                  {isHKCovered && (
                    <div className="flex items-center justify-between p-4 rounded-lg bg-black/5 dark:bg-white/5 border border-border/20">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground">{t('source.hko')}</span>
                          <span className="text-xs text-muted-foreground">{t('source.hkoDesc')}</span>
                        </div>
                      </div>
                      {renderStatusBadge(loadProgress.hko)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : !weather && error ? (
            <div className="text-center py-20 glass-card">
              <p className="text-lg text-destructive mb-2">{t('loading.failed')}</p>
              <p className="text-base text-muted-foreground">{t('loading.tryAgain')}</p>
            </div>
          ) : weather ? (
            <div className="space-y-6 lg:space-y-8 animate-fade-in">
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

              {/* HKO Data Failed Banner (Open-Meteo ok but HKO failed) */}
              {weather.hkoFailed && !weather.isFallback && isHKCovered && (
                <div className="glass-card border-amber-500/20 bg-amber-500/5 p-4 rounded-xl flex items-start gap-3 text-amber-600 dark:text-amber-400 animate-fade-in">
                  <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-sm">{t('fallback.hkoFailedTitle')}</h4>
                    <p className="text-xs opacity-90 mt-1">{t('fallback.hkoFailedDesc')}</p>
                  </div>
                </div>
              )}

              {/* Top Row: Alerts and Hero (Full Width) */}
              <div className="space-y-6">
                {weather.warnings && weather.warnings.length > 0 && (
                  <WeatherAlerts warnings={weather.warnings} />
                )}

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

              {/* Bottom Row: Optional Map — available for Pearl River Delta region (HK + Guangdong) */}
              {selectedCity && isInRainfallRegion(selectedCity.latitude, selectedCity.longitude) && (
                <Suspense fallback={<div className="h-[400px] animate-pulse bg-muted/20 rounded-xl" />}>
                  <RainfallMap userLocation={selectedCity ? { latitude: selectedCity.latitude, longitude: selectedCity.longitude } : undefined} />
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
