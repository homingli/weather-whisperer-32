import { memo, useState, useEffect } from "react";
import { CurrentWeather as CurrentWeatherType, HourlyForecast, DailyForecast, getWeatherIcon } from "@/lib/weather";
import { Umbrella, UmbrellaOff, Sunrise, Sunset, ArrowUp, ArrowDown, MoveUp, Droplets, Sun } from "lucide-react";
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
  const isCurrentlyRaining = weather.precipitation > 2;
  const next6Hours = hourlyForecast.slice(0, 6);
  const firstRainyHour = next6Hours.find(hour => hour.precipitationProbability >= 25);
  // Also consider daily max probability (handles HKO PSR mismatch)
  const isRainyDay = dailyForecast ? dailyForecast.precipitationProbabilityMax >= 50 : false;
  const needsUmbrella = isCurrentlyRaining || !!firstRainyHour || isRainyDay;

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

  // UV interpretation
  const getUvLevel = (uv: number) => {
    if (uv <= 2) return { color: 'text-green-400', bg: 'bg-green-400/10' };
    if (uv <= 5) return { color: 'text-yellow-400', bg: 'bg-yellow-400/10' };
    if (uv <= 7) return { color: 'text-orange-400', bg: 'bg-orange-400/10' };
    if (uv <= 10) return { color: 'text-red-400', bg: 'bg-red-400/10' };
    return { color: 'text-purple-400', bg: 'bg-purple-400/10' };
  };

  const uvInfo = getUvLevel(weather.uvIndex);

  return (
    <div className="glass-card p-8 animate-fade-in" style={{ animationDelay: "0.1s" }}>
      <div className="flex flex-col md:grid md:grid-cols-[45%_55%] gap-8 items-center md:items-stretch">
        
        {/* Left Column: Main Info (Date, Time, Hero Temperature) */}
        <div className="flex flex-col items-center justify-center text-center md:text-left md:items-start space-y-8 md:border-r md:border-border/50 md:pr-12">
          {/* Date and time */}
          <div>
            <p className="text-base text-muted-foreground uppercase tracking-[0.2em] mb-2">
              {timezone ? getLocalDate() : currentTime.toLocaleDateString()}
            </p>
            <p className="text-5xl font-extralight text-foreground tracking-tighter tabular-nums leading-none">
              {timezone ? getLocalTime() : currentTime.toLocaleTimeString()}
            </p>
          </div>

          <div className="flex flex-col items-center md:items-start gap-4">
            <div className="flex items-center gap-6">
              {/* Weather icon */}
              <div className="text-9xl weather-icon-glow leading-none select-none" role="img" aria-label={t('weather.condition')}>
                {getWeatherIcon(weather.weatherCode, weather.isDay)}
              </div>

              <div className="flex flex-col">
                <p className="text-sm text-muted-foreground font-medium uppercase tracking-widest mb-1">{t('weather.feelsLike')}</p>
                <div className="text-9xl font-extralight tracking-tighter leading-none flex items-baseline" aria-label={`${Math.round(weather.apparentTemperature)} degrees`}>
                  {Math.round(weather.apparentTemperature)}
                  <span className="text-5xl self-start mt-2">°</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Detailed Indicators */}
        <div className="w-full flex flex-col justify-center space-y-8 md:pl-4 md:pr-8">
          {/* High/Low and Sun Event Row */}
          <div className="grid grid-cols-2 gap-4">
            {/* High/Low */}
            <div className="glass-card-sub p-4 flex items-center justify-center md:justify-start gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <ArrowUp className="h-5 w-5 text-orange-400" />
                  <span className="text-2xl font-light tabular-nums">{Math.round(dailyForecast?.temperatureMax || 0)}°</span>
                </div>
                <div className="flex items-center gap-3">
                  <ArrowDown className="h-5 w-5 text-blue-400" />
                  <span className="text-2xl font-light tabular-nums">{Math.round(dailyForecast?.temperatureMin || 0)}°</span>
                </div>
              </div>
              <p className="hidden md:block text-[10px] text-muted-foreground uppercase tracking-wider vertical-text ml-auto">
                {t('daily.today')}
              </p>
            </div>

            {/* Sun Event */}
            <div className="glass-card-sub p-4 flex items-center justify-center md:justify-start gap-4">
              <div className="p-2.5 rounded-full bg-amber-400/10">
                {sunEvent ? (
                  <sunEvent.icon className="h-6 w-6 text-amber-400" />
                ) : (
                  <Sunset className="h-6 w-6 text-muted-foreground/40" />
                )}
              </div>
              <p className="text-xl font-medium tabular-nums leading-tight">
                {sunEvent?.time || '--:--'}
              </p>
              <p className="hidden md:block text-[10px] text-muted-foreground uppercase tracking-wider vertical-text ml-auto">
                {sunEvent?.type === 'sunset' ? t('daily.sunset') : t('daily.sunrise')}
              </p>
            </div>
          </div>

          {/* Environmental Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Umbrella */}
            <div className="p-4 rounded-2xl bg-blue-400/5 flex flex-col items-center gap-2 transition-colors">
              {needsUmbrella ? (
                <Umbrella className="h-6 w-6 text-weather-rain" />
              ) : (
                <UmbrellaOff className="h-6 w-6 text-muted-foreground/40" />
              )}
              <div className="text-center">
                <span className={`text-sm font-semibold block leading-none mb-1 ${needsUmbrella ? 'text-weather-rain' : 'text-muted-foreground'}`}>
                  {needsUmbrella ? t('umbrella.yes') : t('umbrella.no')}
                </span>
                <span className="text-[9px] text-muted-foreground uppercase font-medium">{t('umbrella.label')}</span>
              </div>
            </div>

            {/* Humidity */}
            <div className="p-4 rounded-2xl bg-blue-400/5 flex flex-col items-center gap-2">
              <Droplets className="h-6 w-6 text-blue-400" />
              <div className="text-center">
                <span className="text-sm font-semibold block leading-none mb-1">{Math.round(weather.humidity)}%</span>
                <span className="text-[9px] text-muted-foreground uppercase font-medium">{t('weather.humidity')}</span>
              </div>
            </div>

            {/* Wind */}
            <div className="p-4 rounded-2xl bg-sky-400/5 flex flex-col items-center gap-2">
              <div style={{ transform: `rotate(${weather.windDirection + 180}deg)` }}>
                <MoveUp className="h-6 w-6 text-sky-400" />
              </div>
              <div className="text-center">
                <span className="text-sm font-semibold block leading-none mb-1">
                  {Math.round(weather.windSpeed)}
                  <span className="text-[10px] font-normal opacity-70 ml-0.5">{t('unit.kmh')}</span>
                </span>
                <span className="text-[9px] text-muted-foreground uppercase font-medium">{t('weather.wind')}</span>
              </div>
            </div>

            {/* UV Index */}
            <div className="p-4 rounded-2xl bg-blue-400/5 flex flex-col items-center gap-2">
              <Sun className={`h-6 w-6 ${uvInfo.color}`} />
              <div className="text-center">
                <span className="text-sm font-semibold block leading-none mb-1">{weather.uvIndex.toFixed(1)}</span>
                <span className="text-[9px] text-muted-foreground uppercase font-medium">{t('weather.uvIndex')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

