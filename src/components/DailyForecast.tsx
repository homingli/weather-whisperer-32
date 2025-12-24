import { DailyForecast as DailyForecastType, getWeatherIcon, getWeatherDescription } from "@/lib/weather";
import { format, isToday, isTomorrow } from "date-fns";
import { Droplets } from "lucide-react";

interface DailyForecastProps {
  forecast: DailyForecastType[];
}

export function DailyForecast({ forecast }: DailyForecastProps) {
  const formatDay = (date: Date) => {
    if (isToday(date)) return "Today";
    if (isTomorrow(date)) return "Tomorrow";
    return format(date, "EEE");
  };

  // Find min and max temps for the week to calculate bar widths
  const allTemps = forecast.flatMap(d => [d.temperatureMin, d.temperatureMax]);
  const weekMin = Math.min(...allTemps);
  const weekMax = Math.max(...allTemps);
  const tempRange = weekMax - weekMin;

  return (
    <div className="glass-card p-4 animate-fade-in" style={{ animationDelay: "0.3s" }}>
      <h3 className="text-sm font-medium text-muted-foreground mb-4 px-2">
        7-DAY FORECAST
      </h3>
      
      <div className="space-y-1">
        {forecast.map((day) => {
          const minPercent = ((day.temperatureMin - weekMin) / tempRange) * 100;
          const maxPercent = ((day.temperatureMax - weekMin) / tempRange) * 100;

          return (
            <div
              key={day.date.toISOString()}
              className="flex items-center gap-4 px-2 py-3 rounded-xl hover:bg-secondary/30 transition-colors"
            >
              <div className="w-20 text-sm">
                <span className="font-medium">{formatDay(day.date)}</span>
                <span className="text-xs text-muted-foreground ml-1">{format(day.date, "d/M")}</span>
              </div>
              
              <span className="text-2xl w-10 text-center">{getWeatherIcon(day.weatherCode, true)}</span>
              
              <div className="flex items-center gap-1 w-12">
                {day.precipitationProbabilityMax > 0 && (
                  <>
                    <Droplets className="h-3 w-3 text-weather-rain" />
                    <span className="text-xs text-weather-rain">{day.precipitationProbabilityMax}%</span>
                  </>
                )}
              </div>
              
              <span className="w-10 text-right text-muted-foreground">
                {Math.round(day.temperatureMin)}°
              </span>
              
              <div className="flex-1 h-1.5 bg-secondary/50 rounded-full overflow-hidden relative">
                <div
                  className="absolute h-full rounded-full bg-gradient-to-r from-weather-rain via-weather-sunny to-destructive"
                  style={{
                    left: `${minPercent}%`,
                    right: `${100 - maxPercent}%`,
                  }}
                />
              </div>
              
              <span className="w-10 font-medium">{Math.round(day.temperatureMax)}°</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
