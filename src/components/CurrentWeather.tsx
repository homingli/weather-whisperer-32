import { CurrentWeather as CurrentWeatherType, HourlyForecast, getWeatherIcon } from "@/lib/weather";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Umbrella, UmbrellaOff } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface CurrentWeatherProps {
  weather: CurrentWeatherType;
  hourlyForecast: HourlyForecast[];
  locationName?: string;
  timezone?: string;
}

export function CurrentWeather({ weather, hourlyForecast, locationName, timezone }: CurrentWeatherProps) {
  const { language, t } = useLanguage();
  const locale = language === 'tc' ? zhTW : undefined;

  const dateFormat = language === 'tc' ? "yyyy年M月d日 EEEE" : "EEEE, d MMMM yyyy";
  const timeFormat = "HH:mm";

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

  return (
    <div className="glass-card p-6 animate-fade-in" style={{ animationDelay: "0.1s" }}>
      <p className="text-lg text-muted-foreground text-center mb-6">
        {timezone ? getLocalDateTime() : format(new Date(), dateFormat, { locale })}
      </p>
      
      <div className="flex items-center justify-center gap-8">
        {/* Weather Icon */}
        <div className="text-7xl weather-icon-glow">
          {getWeatherIcon(weather.weatherCode, weather.isDay)}
        </div>
        
        {/* Temperature */}
        <div className="text-center">
          <span className="text-6xl font-light tracking-tighter">{Math.round(weather.apparentTemperature)}°</span>
          <p className="text-sm text-muted-foreground mt-1">{t('weather.feelsLike')}</p>
        </div>
        
        {/* Umbrella */}
        <div className="text-center">
          {needsUmbrella ? (
            <Umbrella className="h-14 w-14 text-weather-rain mx-auto" />
          ) : (
            <UmbrellaOff className="h-14 w-14 text-muted-foreground/50 mx-auto" />
          )}
          <p className="text-sm text-muted-foreground mt-1">
            {needsUmbrella ? t('umbrella.yes') : t('umbrella.no')}
          </p>
        </div>
      </div>
    </div>
  );
}
