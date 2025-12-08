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
      
      <ScrollArea className="w-full">
        <div className="flex gap-2 pb-4">
          {forecast.map((hour, index) => (
            <div
              key={hour.time.toISOString()}
              className="flex flex-col items-center gap-2 px-4 py-3 min-w-[72px] rounded-xl hover:bg-secondary/30 transition-colors"
            >
              <span className="text-sm text-muted-foreground">
                {index === 0 ? "Now" : format(hour.time, "ha")}
              </span>
              <span className="text-2xl">{getWeatherIcon(hour.weatherCode, hour.isDay)}</span>
              <span className="font-medium">{Math.round(hour.temperature)}°</span>
              {hour.precipitationProbability > 0 && (
                <span className="text-xs text-weather-rain">
                  {hour.precipitationProbability}%
                </span>
              )}
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
