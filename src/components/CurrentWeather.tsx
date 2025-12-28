import { CurrentWeather as CurrentWeatherType, getWeatherIcon } from "@/lib/weather";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { useLanguage } from "@/contexts/LanguageContext";

interface CurrentWeatherProps {
  weather: CurrentWeatherType;
}

export function CurrentWeather({ weather }: CurrentWeatherProps) {
  const { language, t } = useLanguage();
  const locale = language === 'tc' ? zhTW : undefined;

  const dateFormat = language === 'tc' ? "yyyy年M月d日 EEEE" : "EEEE, d MMMM yyyy";

  return (
    <div className="pt-2 pb-8 animate-fade-in text-center" style={{ animationDelay: "0.1s" }}>
      <p className="text-xl text-muted-foreground mb-6">
        {format(new Date(), dateFormat, { locale })}
      </p>
      
      <div className="flex flex-col items-center gap-4">
        <div className="text-8xl weather-icon-glow">
          {getWeatherIcon(weather.weatherCode, weather.isDay)}
        </div>
        <span className="text-7xl font-light tracking-tighter">{Math.round(weather.apparentTemperature)}°</span>
        <span className="text-sm text-muted-foreground">{t('weather.feelsLike')}</span>
      </div>
    </div>
  );
}
