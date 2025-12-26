import { HourlyForecast } from "@/lib/weather";
import { format } from "date-fns";
import { Umbrella } from "lucide-react";

interface UmbrellaSectionProps {
  forecast: HourlyForecast[];
}

export function UmbrellaSection({ forecast }: UmbrellaSectionProps) {
  const firstRainyHour = forecast.find(hour => hour.precipitationProbability >= 10);
  const needsUmbrella = !!firstRainyHour;

  return (
    <div className="glass-card p-6 animate-fade-in text-center" style={{ animationDelay: "0.1s" }}>
      <h3 className="text-sm font-medium text-muted-foreground mb-4">
        DO I NEED AN UMBRELLA TODAY?
      </h3>
      
      <div className="flex items-center justify-center gap-3">
        <Umbrella className={`h-8 w-8 ${needsUmbrella ? 'text-weather-rain' : 'text-muted-foreground'}`} />
        <span className={`text-5xl font-bold ${needsUmbrella ? 'text-weather-rain' : 'text-foreground'}`}>
          {needsUmbrella ? 'YES' : 'NO'}
        </span>
      </div>
      
      {needsUmbrella && firstRainyHour && (
        <p className="mt-3 text-muted-foreground">
          {firstRainyHour.precipitationProbability}% chance of rain at {format(firstRainyHour.time, "h a")}
        </p>
      )}
    </div>
  );
}
