import { CurrentWeather as CurrentWeatherType, getWeatherIcon } from "@/lib/weather";
import { format } from "date-fns";

interface CurrentWeatherProps {
  weather: CurrentWeatherType;
}

export function CurrentWeather({ weather }: CurrentWeatherProps) {
  return (
    <div className="py-8 animate-fade-in text-center" style={{ animationDelay: "0.1s" }}>
      <p className="text-xl text-muted-foreground mb-6">
        {format(new Date(), "EEEE, d MMMM yyyy")}
      </p>
      
      <div className="flex flex-col items-center gap-4">
        <div className="text-8xl weather-icon-glow">
          {getWeatherIcon(weather.weatherCode, weather.isDay)}
        </div>
        <span className="text-7xl font-light tracking-tighter">{Math.round(weather.apparentTemperature)}°</span>
        <span className="text-sm text-muted-foreground">Feels like</span>
      </div>
    </div>
  );
}
