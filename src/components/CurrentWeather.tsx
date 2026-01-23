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
      {/* Two column layout: 70% / 30% */}
      <div className="grid grid-cols-[70%_30%] gap-4">
        {/* Left column: Temperature focus */}
        <div className="flex flex-col justify-center">
          {/* Date and time */}
          <p className="text-lg text-muted-foreground mb-2">
            {timezone ? getLocalDateTime() : new Date().toLocaleDateString()}
          </p>
          
          {/* Hero: Feels Like Temperature */}
          <div className="text-9xl font-extralight tracking-tighter leading-none">
            {Math.round(weather.apparentTemperature)}°
          </div>
          <p className="text-lg text-muted-foreground mt-2">{t('weather.feelsLike')}</p>
          
          {/* High/Low temps */}
          {dailyForecast && (
            <div className="flex items-center gap-6 mt-4">
              <div className="flex items-center gap-1.5 text-lg">
                <ArrowUp className="h-5 w-5 text-orange-400" />
                <span className="font-medium">{Math.round(dailyForecast.temperatureMax)}°</span>
              </div>
              <div className="flex items-center gap-1.5 text-lg">
                <ArrowDown className="h-5 w-5 text-blue-400" />
                <span className="font-medium">{Math.round(dailyForecast.temperatureMin)}°</span>
              </div>
            </div>
          )}
        </div>
        
        {/* Right column: Indicators stacked */}
        <div className="flex flex-col items-center justify-between py-2">
          {/* Weather icon */}
          <div className="text-6xl weather-icon-glow">
            {getWeatherIcon(weather.weatherCode, weather.isDay)}
          </div>
          
          {/* Sun event */}
          <div className="flex flex-col items-center gap-1">
            {sunEvent ? (
              <>
                <sunEvent.icon className="h-10 w-10 text-amber-400" />
                <p className="text-sm text-muted-foreground">{sunEvent.time}</p>
              </>
            ) : (
              <>
                <Sunset className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">--:--</p>
              </>
            )}
          </div>
          
          {/* Umbrella */}
          <div className="flex flex-col items-center gap-1">
            {needsUmbrella ? (
              <Umbrella className="h-10 w-10 text-weather-rain" />
            ) : (
              <UmbrellaOff className="h-10 w-10 text-muted-foreground/40" />
            )}
            <p className="text-sm text-muted-foreground">
              {needsUmbrella ? t('umbrella.yes') : t('umbrella.no')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
