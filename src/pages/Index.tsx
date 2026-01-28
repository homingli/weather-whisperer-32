import { useEffect, useState, useMemo, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { CitySearch } from "@/components/CitySearch";
import { CurrentWeather } from "@/components/CurrentWeather";
import { DailyForecast } from "@/components/DailyForecast";
import { WeatherSkeleton } from "@/components/WeatherSkeleton";
import { WeatherAlerts } from "@/components/WeatherAlerts";
import { LanguageToggle } from "@/components/LanguageToggle";
import { GeoLocation, getDefaultCity, getWeather, getUserLocation, reverseGeocode, setDefaultCity, WeatherData } from "@/lib/weather";
import { getHKODailyAndWarnings, HKOWarning, isInHongKong } from "@/lib/hko-weather";
import { useLanguage, formatString } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CloudRain } from "lucide-react";

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
  const { language, t } = useLanguage();
  const { setSunTimes } = useTheme();

  useEffect(() => {
    const initializeLocation = async () => {
      // First check if there's a saved default city
      const defaultCity = getDefaultCity();
      if (defaultCity) {
        setSelectedCity(defaultCity);
        return;
      }

      // Otherwise, try to get user's current location
      setIsLocating(true);
      try {
        const coords = await getUserLocation();
        const location = await reverseGeocode(coords.latitude, coords.longitude);
        if (location) {
          setSelectedCity(location);
          setDefaultCity(location); // Save as default
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
  // Always keep Open-Meteo daily for sunrise/sunset times (HKO doesn't provide these)
  const weather: ExtendedWeatherData | undefined = useMemo(() => {
    if (!openMeteoData) return undefined;

    return {
      current: openMeteoData.current,
      hourly: openMeteoData.hourly,
      daily: isHKCovered && hkoData ? hkoData.daily : openMeteoData.daily,
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

  return (
    <div className="min-h-screen gradient-sky">
      <div className="container max-w-2xl mx-auto px-4 pt-[10px] pb-8">
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="sr-only">Weather Forecast</h1>
          <CitySearch currentCity={selectedCity} onCitySelect={setSelectedCity} />
          {isHKCovered && weather?.nearestStation && (
            <p className="text-base text-muted-foreground mt-1">
              {weather.nearestStation}
            </p>
          )}
        </header>

        {/* Main content */}
        <main className="space-y-6">
          {/* Weather Alerts (HKO coverage only) */}
          {isHKCovered && weather?.warnings && weather.warnings.length > 0 && (
            <WeatherAlerts warnings={weather.warnings} />
          )}

          {isLocating ? (
            <div className="text-center py-20 animate-fade-in">
              <CloudRain className="h-20 w-20 mx-auto mb-4 text-primary animate-pulse-glow" />
              <h2 className="text-3xl font-semibold mb-2">{t('loading.findingLocation')}</h2>
              <p className="text-lg text-muted-foreground">
                {t('loading.allowLocation')}
              </p>
            </div>
          ) : !selectedCity ? (
            <div className="text-center py-20 animate-fade-in">
              <CloudRain className="h-20 w-20 mx-auto mb-4 text-primary animate-pulse-glow" />
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
            <>
              <CurrentWeather
                weather={weather.current}
                hourlyForecast={weather.hourly}
                dailyForecast={sunTimes?.[0]}
                locationName={selectedCity?.name}
                timezone={weather.timezone}
              />
              <Suspense fallback={<div className="h-[300px] animate-pulse bg-muted/20 rounded-xl" />}>
                <HourlyForecast forecast={weather.hourly} daily={sunTimes} timezone={weather.timezone} />
              </Suspense>
              <DailyForecast forecast={weather.daily} />
            </>
          ) : null}
        </main>

        {/* Footer */}
        <footer className="text-center mt-12 text-sm text-muted-foreground space-y-2">
          <div className="flex items-center justify-center gap-2">
            <ThemeToggle />
            <LanguageToggle />
          </div>
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
