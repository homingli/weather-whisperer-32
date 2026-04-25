import { useEffect, useState, useMemo, useCallback, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { CurrentWeather } from "@/components/CurrentWeather";
import { DailyForecast } from "@/components/DailyForecast";
import { WeatherSkeleton } from "@/components/WeatherSkeleton";
import { WeatherAlerts } from "@/components/WeatherAlerts";
import { SettingsMenu } from "@/components/SettingsMenu";
import { GeoLocation, getDefaultCity, getRecentCities, getWeather, getUserLocation, reverseGeocode, setDefaultCity, WeatherData, getLastWeatherFetchTime } from "@/lib/weather";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { getHKODailyAndWarnings, HKOWarning, isInHongKong } from "@/lib/hko-weather";
import { useLanguage, formatString } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { CloudRain, MapPin, Download } from "lucide-react";

// Lazy load heavy components
const HourlyForecast = lazy(() => import("@/components/HourlyForecast").then(module => ({ default: module.HourlyForecast })));

interface ExtendedWeatherData extends WeatherData {
  warnings?: HKOWarning[];
  nearestStation?: string;
  nearestDistrict?: string;
}

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

  // Fetch Open-Meteo data for current weather and hourly forecast
  const { data: openMeteoData, isLoading: isLoadingOpenMeteo, error: openMeteoError } = useQuery({
    queryKey: ["weather-openmeteo", selectedCity?.latitude, selectedCity?.longitude],
    queryFn: async () => {
      return getWeather(selectedCity!.latitude, selectedCity!.longitude);
    },
    enabled: !!selectedCity,
    refetchInterval: 10 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });

  // Fetch HKO data for daily forecast and warnings (only when in HK)
  const { data: hkoData, isLoading: isLoadingHKO } = useQuery({
    queryKey: ["weather-hko", language, selectedCity?.latitude, selectedCity?.longitude],
    queryFn: async () => {
      const hkoLang = language === 'tc' ? 'tc' : 'en';
      return getHKODailyAndWarnings(hkoLang, selectedCity!.latitude, selectedCity!.longitude);
    },
    enabled: !!selectedCity && isHKCovered,
    refetchInterval: 10 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });

  // Combine data: Open-Meteo for current+hourly, HKO for daily+warnings when in HK
  // Always keep Open-Meteo daily for sunrise/sunset times (HKO doesn't provide these reliably)
  const weather: ExtendedWeatherData | undefined = useMemo(() => {
    if (!openMeteoData) return undefined;

    const daily = (isHKCovered && hkoData) 
      ? hkoData.daily.map((day, i) => ({
          ...day,
          // Inject sun times from Open-Meteo if available for the same day
          sunrise: openMeteoData.daily[i]?.sunrise || day.sunrise,
          sunset: openMeteoData.daily[i]?.sunset || day.sunset,
        }))
      : openMeteoData.daily;

    return {
      current: openMeteoData.current,
      hourly: openMeteoData.hourly,
      daily,
      warnings: isHKCovered && hkoData ? hkoData.warnings : undefined,
      nearestStation: hkoData?.nearestStation,
      nearestDistrict: hkoData?.nearestDistrict,
      timezone: isHKCovered && hkoData?.timezone ? hkoData.timezone : openMeteoData.timezone,
    };
  }, [openMeteoData, isHKCovered, hkoData]);

  // Open-Meteo daily data is always used for sunrise/sunset (HKO doesn't provide it)
  const sunTimes = useMemo(() => openMeteoData?.daily, [openMeteoData]);

  // Update theme context with sunrise/sunset times for auto mode
  useEffect(() => {
    if (sunTimes && sunTimes.length > 0) {
      const todayForecast = sunTimes[0];
      setSunTimes(todayForecast.sunrise, todayForecast.sunset);
    }
  }, [sunTimes, setSunTimes]);

  const isLoading = isLoadingOpenMeteo || (isHKCovered && isLoadingHKO);
  const error = openMeteoError;

  // PWA install
  const { deferredPrompt, isInstalled, install } = usePwaInstall();

  // Freshness indicator: only show when using cached/stale data
  // Show when we have cached data (not currently loading, but have stale data displayed)
  const lastFetchISO = getLastWeatherFetchTime();
  const cacheLabel = !isLoadingOpenMeteo && openMeteoData && lastFetchISO
    ? `Fresh data as of ${new Date(lastFetchISO).toLocaleString()}`
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
                  {isHKCovered && weather?.nearestStation && (
                    <span className="text-sm px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                      {weather.nearestStation}
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
            {(deferredPrompt || isInstalled) && (
              <button
                onClick={install}
                disabled={!deferredPrompt || isInstalled}
                className="h-9 px-3 flex items-center gap-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                title={isInstalled ? 'Installed' : 'Install app'}
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">{isInstalled ? 'Installed' : 'Install'}</span>
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
          ) : error ? (
            <div className="text-center py-20 glass-card">
              <p className="text-lg text-destructive mb-2">{t('loading.failed')}</p>
              <p className="text-base text-muted-foreground">{t('loading.tryAgain')}</p>
            </div>
          ) : weather ? (
            <div className="space-y-6 lg:space-y-8">
              {/* Top Row: Alerts and Hero (Full Width) */}
              <div className="space-y-6">
                {isHKCovered && weather.warnings && weather.warnings.length > 0 && (
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
