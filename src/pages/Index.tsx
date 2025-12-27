import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CitySearch } from "@/components/CitySearch";
import { CurrentWeather } from "@/components/CurrentWeather";
import { HourlyForecast } from "@/components/HourlyForecast";
import { DailyForecast } from "@/components/DailyForecast";
import { UmbrellaSection } from "@/components/UmbrellaSection";
import { WeatherSkeleton } from "@/components/WeatherSkeleton";
import { WeatherSourceToggle } from "@/components/WeatherSourceToggle";
import { WeatherAlerts } from "@/components/WeatherAlerts";
import { GeoLocation, getDefaultCity, getWeather, getUserLocation, reverseGeocode, setDefaultCity, WeatherData } from "@/lib/weather";
import { getHKOWeather, HKOWarning } from "@/lib/hko-weather";
import { useWeatherSource } from "@/contexts/WeatherSourceContext";
import { CloudRain } from "lucide-react";

// Hong Kong location for HKO API
const HONG_KONG_LOCATION: GeoLocation = {
  name: "Hong Kong",
  latitude: 22.3193,
  longitude: 114.1694,
  country: "China",
  admin1: "Hong Kong",
};

interface ExtendedWeatherData extends WeatherData {
  warnings?: HKOWarning[];
}

const Index = () => {
  const [selectedCity, setSelectedCity] = useState<GeoLocation | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const { source, isHKO } = useWeatherSource();

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

  // When switching to HKO, automatically switch to Hong Kong
  useEffect(() => {
    if (isHKO && selectedCity?.name !== 'Hong Kong') {
      setSelectedCity(HONG_KONG_LOCATION);
    }
  }, [isHKO]);

  const { data: weather, isLoading, error } = useQuery<ExtendedWeatherData>({
    queryKey: ["weather", source, selectedCity?.latitude, selectedCity?.longitude],
    queryFn: async () => {
      if (isHKO) {
        return getHKOWeather();
      }
      return getWeather(selectedCity!.latitude, selectedCity!.longitude);
    },
    enabled: !!selectedCity || isHKO,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    staleTime: 2 * 60 * 1000, // Consider data stale after 2 minutes
  });

  // Determine which city to display
  const displayCity = isHKO ? HONG_KONG_LOCATION : selectedCity;

  return (
    <div className="min-h-screen gradient-sky">
      <div className="container max-w-2xl mx-auto px-4 pt-[10px] pb-8">
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="sr-only">Weather Forecast</h1>
          {isHKO ? (
            <div className="mb-2">
              <h2 className="text-2xl font-semibold text-foreground">Hong Kong</h2>
              <p className="text-sm text-muted-foreground">Hong Kong Observatory</p>
            </div>
          ) : (
            <CitySearch currentCity={selectedCity} onCitySelect={setSelectedCity} />
          )}
        </header>

        {/* Main content */}
        <main className="space-y-6">
          {/* Weather Alerts (HKO only) */}
          {isHKO && weather?.warnings && weather.warnings.length > 0 && (
            <WeatherAlerts warnings={weather.warnings} />
          )}

          {isLocating && !isHKO ? (
            <div className="text-center py-20 animate-fade-in">
              <CloudRain className="h-16 w-16 mx-auto mb-4 text-primary animate-pulse-glow" />
              <h2 className="text-2xl font-semibold mb-2">Finding your location...</h2>
              <p className="text-muted-foreground">
                Please allow location access for local weather
              </p>
            </div>
          ) : !displayCity && !isHKO ? (
            <div className="text-center py-20 animate-fade-in">
              <CloudRain className="h-16 w-16 mx-auto mb-4 text-primary animate-pulse-glow" />
              <h2 className="text-2xl font-semibold mb-2">Welcome to Weather</h2>
              <p className="text-muted-foreground">
                Search for a city to see current weather and forecasts
              </p>
            </div>
          ) : isLoading ? (
            <WeatherSkeleton />
          ) : error ? (
            <div className="text-center py-20 glass-card">
              <p className="text-destructive mb-2">Failed to load weather data</p>
              <p className="text-sm text-muted-foreground">Please try again later</p>
            </div>
          ) : weather ? (
          <>
              <CurrentWeather weather={weather.current} />
              <UmbrellaSection current={weather.current} forecast={weather.hourly} />
              <HourlyForecast forecast={weather.hourly} />
              <DailyForecast forecast={weather.daily} />
            </>
          ) : null}
        </main>

        {/* Footer */}
        <footer className="text-center mt-12 text-sm text-muted-foreground space-y-2">
          <WeatherSourceToggle />
          <p>Powered by {isHKO ? 'Hong Kong Observatory' : 'Open-Meteo'}</p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
