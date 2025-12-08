import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CitySearch } from "@/components/CitySearch";
import { CurrentWeather } from "@/components/CurrentWeather";
import { HourlyForecast } from "@/components/HourlyForecast";
import { DailyForecast } from "@/components/DailyForecast";
import { WeatherSkeleton } from "@/components/WeatherSkeleton";
import { GeoLocation, getDefaultCity, getWeather } from "@/lib/weather";
import { CloudRain } from "lucide-react";

const Index = () => {
  const [selectedCity, setSelectedCity] = useState<GeoLocation | null>(null);

  useEffect(() => {
    const defaultCity = getDefaultCity();
    if (defaultCity) {
      setSelectedCity(defaultCity);
    }
  }, []);

  const { data: weather, isLoading, error } = useQuery({
    queryKey: ["weather", selectedCity?.latitude, selectedCity?.longitude],
    queryFn: () => getWeather(selectedCity!.latitude, selectedCity!.longitude),
    enabled: !!selectedCity,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    staleTime: 2 * 60 * 1000, // Consider data stale after 2 minutes
  });

  return (
    <div className="min-h-screen gradient-sky">
      <div className="container max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="sr-only">Weather Forecast</h1>
          <CitySearch currentCity={selectedCity} onCitySelect={setSelectedCity} />
        </header>

        {/* Main content */}
        <main className="space-y-6">
          {!selectedCity ? (
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
              <HourlyForecast forecast={weather.hourly} />
              <DailyForecast forecast={weather.daily} />
            </>
          ) : null}
        </main>

        {/* Footer */}
        <footer className="text-center mt-12 text-sm text-muted-foreground">
          <p>Powered by Open-Meteo</p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
