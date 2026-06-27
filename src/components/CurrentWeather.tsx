import { memo, useState, useEffect, useMemo, useCallback } from "react";
import { CurrentWeather as CurrentWeatherType, HourlyForecast, DailyForecast, getWeatherIcon, getWeatherDescription } from "@/lib/weather";
import { SENTINEL_THRESHOLD } from "@/lib/constants";
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

  // Sentinel check — values from PLACEHOLDER_CURRENT use PLACEHOLDER_SENTINEL to signal "no data yet"
  const isEmpty = weather.apparentTemperature < SENTINEL_THRESHOLD;

  // Format a value: render `-` when placeholder sentinel detected
  const fmt = (v: number, suffix = '') => v < SENTINEL_THRESHOLD ? '-' : `${Math.round(v)}${suffix}`;

  // Wrap in useMemo to prevent unnecessary re-calculations on every second tick
  const needsUmbrella = useMemo(() => {
    const isCurrentlyRaining = (weather.precipitation ?? 0) > 2;
    const next6Hours = hourlyForecast.slice(0, 6);
    const firstRainyHour = next6Hours.find(hour => hour.precipitationProbability >= 25);
    return isCurrentlyRaining || !!firstRainyHour;
  }, [weather, hourlyForecast]);

  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Timer interval updates state every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Memoize formatters to optimize rendering performance and prevent GC pressure
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(language === 'tc' ? 'zh-TW' : 'en-US', {
    timeZone: timezone, year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
  }), [language, timezone]);

  const timeFormatter = useMemo(() => new Intl.DateTimeFormat(language === 'tc' ? 'zh-TW' : 'en-US', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: language !== 'tc'
  }), [language, timezone]);

  const sunTimeFormatter = useMemo(() => new Intl.DateTimeFormat(language === 'tc' ? 'zh-TW' : 'en-US', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: language !== 'tc'
  }), [language, timezone]);

  // Format local date with fallback to prevent render crash on timezone errors
  const getLocalDate = useCallback(() => {
    try { return dateFormatter.format(currentTime); } catch(e) { return currentTime.toLocaleDateString(); }
  }, [dateFormatter, currentTime]);

  // Format local time with fallback to prevent render crash
  const getLocalTime = useCallback(() => {
    try { return timeFormatter.format(currentTime); } catch(e) { return currentTime.toLocaleTimeString(); }
  }, [timeFormatter, currentTime]);

  // Safely compute next sun event and format time
  const sunEvent = useMemo(() => {
    if (!dailyForecast || !dailyForecast.sunrise || !dailyForecast.sunset) return null;
    try {
      if (weather.isDay) {
        return { type: 'sunset', time: sunTimeFormatter.format(new Date(dailyForecast.sunset)), icon: Sunset };
      }
      return { type: 'sunrise', time: sunTimeFormatter.format(new Date(dailyForecast.sunrise)), icon: Sunrise };
    } catch(e) {
      return null;
    }
  }, [dailyForecast, weather.isDay, sunTimeFormatter]);

  // Memoize UV style object derived from index
  const uvInfo = useMemo(() => {
    const uv = weather.uvIndex;
    if (uv == null) return { color: 'text-muted-foreground/40', bg: 'bg-muted/10' };
    if (uv <= 2) return { color: 'text-green-400', bg: 'bg-green-400/10' };
    if (uv <= 5) return { color: 'text-yellow-400', bg: 'bg-yellow-400/10' };
    if (uv <= 7) return { color: 'text-orange-400', bg: 'bg-orange-400/10' };
    if (uv <= 10) return { color: 'text-red-400', bg: 'bg-red-400/10' };
    return { color: 'text-purple-400', bg: 'bg-purple-400/10' };
  }, [weather.uvIndex]);

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
              <div className="text-5xl sm:text-9xl leading-none select-none" role="img" aria-label={getWeatherDescription(weather.weatherCode, weather.isDay)}>
                {getWeatherIcon(weather.weatherCode, weather.isDay)}
              </div>

              <div className="flex flex-col">
                <p className="text-sm text-muted-foreground font-medium uppercase tracking-widest mb-1">{t('weather.feelsLike')}</p>
                <div className="text-5xl sm:text-9xl font-extralight tracking-tighter leading-none flex items-baseline" aria-label={isEmpty ? '-' : `${Math.round(weather.apparentTemperature)} degrees`}>
                  {fmt(weather.apparentTemperature, '°')}
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
                  <span className="text-2xl font-light tabular-nums">{dailyForecast ? fmt(dailyForecast.temperatureMax, '°') : '-'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <ArrowDown className="h-5 w-5 text-blue-400" />
                  <span className="text-2xl font-light tabular-nums">{dailyForecast ? fmt(dailyForecast.temperatureMin, '°') : '-'}</span>
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
                <span className="text-sm text-muted-foreground uppercase font-medium">{t('umbrella.label')}</span>
              </div>
            </div>

            {/* Humidity */}
            <div className="p-4 rounded-2xl bg-blue-400/5 flex flex-col items-center gap-2">
              <Droplets className="h-6 w-6 text-blue-400" />
              <div className="text-center">
                <span className="text-sm font-semibold block leading-none mb-1">{fmt(weather.humidity, '%')}</span>
                <span className="text-sm text-muted-foreground uppercase font-medium">{t('weather.humidity')}</span>
              </div>
            </div>

            {/* Wind */}
            <div className="p-4 rounded-2xl bg-sky-400/5 flex flex-col items-center gap-2">
              <div style={{ transform: isEmpty ? 'rotate(0deg)' : `rotate(${weather.windDirection + 180}deg)` }}>
                <MoveUp className="h-6 w-6 text-sky-400" />
              </div>
              <div className="text-center">
                <span className="text-sm font-semibold block leading-none mb-1">
                  {fmt(weather.windSpeed)}
                  <span className="text-[10px] font-normal opacity-70 ml-0.5">{t('unit.kmh')}</span>
                </span>
                <span className="text-sm text-muted-foreground uppercase font-medium">{t('weather.wind')}</span>
              </div>
            </div>

            {/* UV Index */}
            <div className="p-4 rounded-2xl bg-blue-400/5 flex flex-col items-center gap-2">
              <Sun className={`h-6 w-6 ${isEmpty ? 'text-muted-foreground/20' : uvInfo.color}`} />
              <div className="text-center">
                <span className="text-sm font-semibold block leading-none mb-1">{isEmpty ? '-' : weather.uvIndex == null ? '--' : weather.uvIndex.toFixed(1)}</span>
                <span className="text-sm text-muted-foreground uppercase font-medium">{t('weather.uvIndex')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
