import { Droplets, Wind, Thermometer } from "lucide-react";
import { CurrentWeather as CurrentWeatherType, getWeatherDescription, getWeatherIcon } from "@/lib/weather";
import { format } from "date-fns";

interface CurrentWeatherProps {
  weather: CurrentWeatherType;
}

export function CurrentWeather({ weather }: CurrentWeatherProps) {
  return (
    <div className="py-8 animate-fade-in" style={{ animationDelay: "0.1s" }}>
      <p className="text-sm text-muted-foreground text-center mb-6">
        {format(new Date(), "EEEE, d MMMM yyyy")}
      </p>
      
      <div className="flex items-center justify-center gap-8 max-w-2xl mx-auto">
        {/* Left column - 70% - Icon and Feels Like */}
        <div className="flex-[7] flex flex-col items-end gap-4">
          <div className="text-8xl weather-icon-glow">
            {getWeatherIcon(weather.weatherCode, weather.isDay)}
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Thermometer className="h-5 w-5 text-weather-sunny" />
            <span className="text-sm">Feels like</span>
            <span className="font-medium text-foreground">{Math.round(weather.apparentTemperature)}°</span>
          </div>
        </div>
        
        {/* Right column - 30% - Temperature, Rain, Wind */}
        <div className="flex-[3] flex flex-col items-start gap-2">
          <div className="text-7xl font-light tracking-tighter">
            {Math.round(weather.temperature)}°
          </div>
          <p className="text-lg text-muted-foreground mb-2">
            {getWeatherDescription(weather.weatherCode)}
          </p>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Droplets className="h-4 w-4 text-weather-rain" />
            <span className="text-sm">Rain</span>
            <span className="font-medium text-foreground">{weather.precipitationProbability}%</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Wind className="h-4 w-4" />
            <span className="text-sm">Wind</span>
            <span className="font-medium text-foreground">{Math.round(weather.windSpeed)} km/h</span>
          </div>
        </div>
      </div>
    </div>
  );
}
