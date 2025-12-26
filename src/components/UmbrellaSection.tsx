import { CurrentWeather, HourlyForecast } from "@/lib/weather";
import { format } from "date-fns";
import { Umbrella } from "lucide-react";

interface UmbrellaSectionProps {
  current: CurrentWeather;
  forecast: HourlyForecast[];
}

export function UmbrellaSection({ current, forecast }: UmbrellaSectionProps) {
  // Check if currently raining (precipitation > 0)
  const isCurrentlyRaining = current.precipitation > 0;
  
  // Check next 6 hours for rain chance >= 10%
  const next6Hours = forecast.slice(0, 6);
  const firstRainyHour = next6Hours.find(hour => hour.precipitationProbability >= 10);
  
  const needsUmbrella = isCurrentlyRaining || !!firstRainyHour;

  return (
    <div className="glass-card p-6 animate-fade-in text-center" style={{ animationDelay: "0.1s" }}>
      <h3 className="text-base font-medium text-muted-foreground mb-4">
        DO I NEED AN UMBRELLA TODAY?
      </h3>
      
      <div className="flex items-center justify-center gap-3">
        <Umbrella className={`h-8 w-8 ${needsUmbrella ? 'text-weather-rain' : 'text-muted-foreground'}`} />
        <span className={`text-5xl font-bold ${needsUmbrella ? 'text-weather-rain' : 'text-foreground'}`}>
          {needsUmbrella ? 'YES' : 'NO'}
        </span>
      </div>
      
      {needsUmbrella && (
        <p className="mt-3 text-muted-foreground">
          {isCurrentlyRaining 
            ? "It's currently raining" 
            : firstRainyHour 
              ? `${firstRainyHour.precipitationProbability}% chance of rain at ${format(firstRainyHour.time, "h a")}`
              : null
          }
        </p>
      )}
    </div>
  );
}
