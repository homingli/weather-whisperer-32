import { CurrentWeather as CurrentWeatherType, HourlyForecast, DailyForecast, getWeatherIcon } from "@/lib/weather";
import { Umbrella, UmbrellaOff, Sunrise, Sunset, ArrowUp, ArrowDown } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface CurrentWeatherProps {
  weather: CurrentWeatherType;
  hourlyForecast: HourlyForecast[];
  dailyForecast?: DailyForecast;
  locationName?: string;
  timezone?: string;
}

export function CurrentWeather({ weather, hourlyForecast, dailyForecast, locationName, timezone }: CurrentWeatherProps) {
  const { language, t } = useLanguage();

  // Umbrella logic - use percentage-based threshold
  const isCurrentlyRaining = weather.precipitation > 0;
  const next6Hours = hourlyForecast.slice(0, 6);
  const firstRainyHour = next6Hours.find(hour => hour.precipitationProbability >= 25);
  const needsUmbrella = isCurrentlyRaining || !!firstRainyHour;

  const getLocalDateTime = () => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: language !== 'tc',
    };

    const formatter = new Intl.DateTimeFormat(language === 'tc' ? 'zh-TW' : 'en-US', options);
    return formatter.format(now);
  };

  // Get next sun event (sunset if day, sunrise if night)
  const getNextSunEvent = () => {
    if (!dailyForecast) return null;
    
    const now = new Date();
    const sunrise = dailyForecast.sunrise;
    const sunset = dailyForecast.sunset;
    
    // Format time in local timezone
    const formatTime = (date: Date) => {
      return new Intl.DateTimeFormat(language === 'tc' ? 'zh-TW' : 'en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: language !== 'tc',
      }).format(date);
    };

    // If it's day time, show sunset. If night, show next sunrise
    if (weather.isDay) {
      return { type: 'sunset', time: formatTime(sunset), icon: Sunset };
    } else {
      // At night - check if it's before or after midnight
      // Show sunrise for the current or next day
      return { type: 'sunrise', time: formatTime(sunrise), icon: Sunrise };
    }
  };

  const sunEvent = getNextSunEvent();

  return (
    <div className="glass-card p-6 animate-fade-in" style={{ animationDelay: "0.1s" }}>
      {/* Date and time */}
      <p className="text-lg text-muted-foreground text-center mb-4">
        {timezone ? getLocalDateTime() : new Date().toLocaleDateString()}
      </p>
      
      {/* Main hero layout */}
      <div className="flex items-center justify-between gap-4">
        {/* Left: Weather Icon */}
        <div className="text-8xl weather-icon-glow flex-shrink-0">
          {getWeatherIcon(weather.weatherCode, weather.isDay)}
        </div>
        
        {/* Center: Temperature display */}
        <div className="flex-1 text-center">
          <div className="text-7xl font-light tracking-tighter mb-1">
            {Math.round(weather.apparentTemperature)}°
          </div>
          <p className="text-sm text-muted-foreground">{t('weather.feelsLike')}</p>
          
          {/* High/Low temps */}
          {dailyForecast && (
            <div className="flex items-center justify-center gap-4 mt-3">
              <div className="flex items-center gap-1 text-sm">
                <ArrowUp className="h-4 w-4 text-orange-400" />
                <span className="text-foreground font-medium">{Math.round(dailyForecast.temperatureMax)}°</span>
              </div>
              <div className="flex items-center gap-1 text-sm">
                <ArrowDown className="h-4 w-4 text-blue-400" />
                <span className="text-foreground font-medium">{Math.round(dailyForecast.temperatureMin)}°</span>
              </div>
            </div>
          )}
        </div>
        
        {/* Right: Umbrella + Sun event */}
        <div className="flex flex-col items-center gap-4 flex-shrink-0">
          {/* Umbrella indicator */}
          <div className="text-center">
            {needsUmbrella ? (
              <Umbrella className="h-10 w-10 text-weather-rain mx-auto" />
            ) : (
              <UmbrellaOff className="h-10 w-10 text-muted-foreground/50 mx-auto" />
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {needsUmbrella ? t('umbrella.yes') : t('umbrella.no')}
            </p>
          </div>
          
          {/* Next sun event */}
          {sunEvent && (
            <div className="text-center">
              <sunEvent.icon className="h-10 w-10 text-amber-400 mx-auto" />
              <p className="text-xs text-muted-foreground mt-1">{sunEvent.time}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
