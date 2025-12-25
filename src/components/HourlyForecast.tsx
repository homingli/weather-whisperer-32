import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { HourlyForecast as HourlyForecastType, getWeatherIcon } from "@/lib/weather";
import { format } from "date-fns";

interface HourlyForecastProps {
  forecast: HourlyForecastType[];
}

export function HourlyForecast({ forecast }: HourlyForecastProps) {
  return (
    <div className="glass-card p-4 animate-fade-in" style={{ animationDelay: "0.2s" }}>
      <h3 className="text-sm font-medium text-muted-foreground mb-4 px-2">
        HOURLY FORECAST
      </h3>
      
      <div className="flex flex-col gap-1">
        {forecast.map((hour, index) => (
          <div
            key={hour.time.toISOString()}
            className="flex items-center justify-between px-4 py-2 rounded-lg hover:bg-secondary/30 transition-colors"
          >
            <span className="text-sm text-muted-foreground w-16">
              {index === 0 ? "Now" : format(hour.time, "ha")}
            </span>
            <span className="text-2xl">{getWeatherIcon(hour.weatherCode, hour.isDay)}</span>
            <span className="font-medium w-12 text-right">{Math.round(hour.temperature)}°</span>
            <span className="text-xs text-weather-rain w-12 text-right">
              {hour.precipitationProbability > 0 ? `${hour.precipitationProbability}%` : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
