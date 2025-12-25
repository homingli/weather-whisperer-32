import { Droplets, Wind, Thermometer } from "lucide-react";
import { CurrentWeather as CurrentWeatherType, getWeatherDescription, getWeatherIcon } from "@/lib/weather";
import { format } from "date-fns";

interface CurrentWeatherProps {
  weather: CurrentWeatherType;
}

export function CurrentWeather({ weather }: CurrentWeatherProps) {
  return (
    <div className="py-8 animate-fade-in" style={{ animationDelay: "0.1s" }}>
      <div className="flex items-center justify-center gap-8">
        {/* Left column - 70% - Main info */}
        <div className="flex-[7] text-right">
          <p className="text-sm text-muted-foreground mb-2">
            {format(new Date(), "EEEE, d MMMM yyyy")}
          </p>
          <div className="text-8xl font-light tracking-tighter mb-1">
            {Math.round(weather.temperature)}°
          </div>
          <p className="text-xl text-muted-foreground">
            {getWeatherDescription(weather.weatherCode)}
          </p>
        </div>
        
        {/* Right column - 30% - Icon */}
        <div className="flex-[3] text-left">
          <div className="text-8xl weather-icon-glow">
            {getWeatherIcon(weather.weatherCode, weather.isDay)}
          </div>
        </div>
      </div>
      
      <div className="flex justify-center mt-6">
        <div className="glass-card inline-flex items-center gap-6 px-6 py-4">
          <div className="flex items-center gap-2">
            <Thermometer className="h-5 w-5 text-weather-sunny" />
            <div className="text-left">
              <p className="text-xs text-muted-foreground">Feels like</p>
              <p className="font-medium">{Math.round(weather.apparentTemperature)}°</p>
            </div>
          </div>
          
          <div className="w-px h-10 bg-border/50" />
          
          <div className="flex items-center gap-2">
            <Droplets className="h-5 w-5 text-weather-rain" />
            <div className="text-left">
              <p className="text-xs text-muted-foreground">Rain chance</p>
              <p className="font-medium">{weather.precipitationProbability}%</p>
            </div>
          </div>
          
          <div className="w-px h-10 bg-border/50" />
          
          <div className="flex items-center gap-2">
            <Wind className="h-5 w-5 text-muted-foreground" />
            <div className="text-left">
              <p className="text-xs text-muted-foreground">Wind</p>
              <p className="font-medium">{Math.round(weather.windSpeed)} km/h</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
