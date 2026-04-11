import { memo, useState, useEffect } from "react";
import { CurrentWeather as CurrentWeatherType, HourlyForecast, DailyForecast, getWeatherIcon } from "@/lib/weather";
import { Umbrella, UmbrellaOff, Sunrise, Sunset, ArrowUp, ArrowDown, Navigation } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface CurrentWeatherProps {
  weather: CurrentWeatherType;
  hourlyForecast: HourlyForecast[];
  dailyForecast?: DailyForecast;
  locationName?: string;
  timezone?: string;
}

export const CurrentWeather = memo(({ weather, hourlyForecast, dailyForecast, locationName, timezone }: CurrentWeatherProps) => {
  const { language, t } = useLanguage();

  // Umbrella logic - use percentage-based threshold
  const isCurrentlyRaining = weather.precipitation > 0;
  const next6Hours = hourlyForecast.slice(0, 6);
  const firstRainyHour = next6Hours.find(hour => hour.precipitationProbability >= 25);
  const needsUmbrella = isCurrentlyRaining || !!firstRainyHour;

  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const getLocalDate = () => {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    };

    const formatter = new Intl.DateTimeFormat(language === 'tc' ? 'zh-TW' : 'en-US', options);
    return formatter.format(currentTime);
  };

  const getLocalTime = () => {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: language !== 'tc',
    };

    const formatter = new Intl.DateTimeFormat(language === 'tc' ? 'zh-TW' : 'en-US', options);
    return formatter.format(currentTime);
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
      <div className="grid grid-cols-1 md:grid-cols-[25%_50%_25%] gap-6 md:gap-4 items-stretch">
        {/* Column 1: High/Low Temperatures */}
        <div className="flex flex-col justify-center items-center md:items-start md:border-r md:border-border/50 md:pr-6">
          {dailyForecast ? (
            <div className="flex flex-row md:flex-col gap-8 md:gap-4">
              <div className="flex flex-col items-center md:items-start gap-1">
                <div className="flex items-center gap-2">
                  <ArrowUp className="h-6 w-6 text-orange-400" aria-hidden="true" />
                  <span className="text-3xl font-light tabular-nums" aria-label={`High temperature: ${Math.round(dailyForecast.temperatureMax)} degrees`}>
                    {Math.round(dailyForecast.temperatureMax)}°
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-center md:items-start gap-1">
                <div className="flex items-center gap-2">
                  <ArrowDown className="h-6 w-6 text-blue-400" aria-hidden="true" />
                  <span className="text-3xl font-light tabular-nums" aria-label={`Low temperature: ${Math.round(dailyForecast.temperatureMin)} degrees`}>
                    {Math.round(dailyForecast.temperatureMin)}°
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="animate-pulse flex flex-col gap-4">
              <div className="h-10 w-20 bg-muted/20 rounded-md" />
              <div className="h-10 w-20 bg-muted/20 rounded-md" />
            </div>
          )}
        </div>

        {/* Column 2: Date, Time & Temperature Focus */}
        <div className="flex flex-col items-center justify-center py-6 md:py-0">
          {/* Date and time */}
          <div className="text-center mb-6">
            <p className="text-base text-muted-foreground uppercase tracking-widest mb-1">
              {timezone ? getLocalDate() : currentTime.toLocaleDateString()}
            </p>
            <p className="text-4xl font-extralight text-foreground tracking-tighter tabular-nums">
              {timezone ? getLocalTime() : currentTime.toLocaleTimeString()}
            </p>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8">
            {/* Weather icon */}
            <div className="text-8xl weather-icon-glow mb-2 md:mb-0" role="img" aria-label={t('weather.condition')}>
              {getWeatherIcon(weather.weatherCode, weather.isDay)}
            </div>

            <div className="flex flex-col items-center md:items-start">
              {/* Hero: Feels Like Temperature */}
              <p className="text-base text-muted-foreground font-medium uppercase tracking-tight mb-1">{t('weather.feelsLike')}</p>
              <div className="text-9xl font-extralight tracking-tighter leading-none" aria-label={`${Math.round(weather.apparentTemperature)} degrees`}>
                {Math.round(weather.apparentTemperature)}°
              </div>
            </div>
          </div>
        </div>

        {/* Column 3: Environmental Indicators */}
        <div className="flex flex-row md:flex-col items-center justify-around md:justify-center gap-4 md:gap-8 md:border-l md:border-border/50 md:pl-6">
          {/* Sun event */}
          <div className="flex flex-col items-center gap-2 group">
            <div className="p-3 rounded-full bg-amber-400/10 group-hover:bg-amber-400/20 transition-colors">
              {sunEvent ? (
                <sunEvent.icon className="h-8 w-8 text-amber-400" aria-hidden="true" />
              ) : (
                <Sunset className="h-8 w-8 text-muted-foreground/40" />
              )}
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold tabular-nums">
                {sunEvent?.time || '--:--'}
              </p>
            </div>
          </div>

          {/* Wind */}
          <div className="flex flex-col items-center gap-2 group">
            <div className="p-3 rounded-full bg-sky-400/10 group-hover:bg-sky-400/20 transition-colors">
              <div style={{ transform: `rotate(${weather.windDirection}deg)` }} className="transition-transform duration-1000 ease-in-out">
                <Navigation className="h-8 w-8 text-sky-400" aria-hidden="true" />
              </div>
            </div>
            <div className="text-center">
              <div className="flex items-center gap-0.5 justify-center">
                <span className="text-sm font-semibold tabular-nums">{Math.round(weather.windSpeed)}</span>
                <span className="text-[10px] text-muted-foreground font-medium">{t('unit.kmh')}</span>
              </div>
            </div>
          </div>

          {/* Umbrella */}
          <div className="flex flex-col items-center gap-2 group">
            <div className={`p-3 rounded-full transition-colors ${needsUmbrella ? 'bg-weather-rain/10 group-hover:bg-weather-rain/20' : 'bg-muted/10 group-hover:bg-muted/20'}`}>
              {needsUmbrella ? (
                <Umbrella className="h-8 w-8 text-weather-rain" role="img" aria-label="Umbrella recommended" />
              ) : (
                <UmbrellaOff className="h-8 w-8 text-muted-foreground/40" role="img" aria-label="No umbrella needed" />
              )}
            </div>
            <div className="text-center">
              <p className={`text-sm font-semibold uppercase ${needsUmbrella ? 'text-weather-rain' : 'text-muted-foreground'}`}>
                {needsUmbrella ? t('umbrella.yes') : t('umbrella.no')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
