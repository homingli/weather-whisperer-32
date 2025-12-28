import { CurrentWeather, HourlyForecast } from "@/lib/weather";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Umbrella, UmbrellaOff } from "lucide-react";
import { useLanguage, formatString } from "@/contexts/LanguageContext";

interface UmbrellaSectionProps {
  current: CurrentWeather;
  forecast: HourlyForecast[];
}

export function UmbrellaSection({ current, forecast }: UmbrellaSectionProps) {
  const { language, t } = useLanguage();
  const locale = language === 'tc' ? zhTW : undefined;

  // Check if currently raining (precipitation > 0)
  const isCurrentlyRaining = current.precipitation > 0;
  
  // Check next 6 hours for rain chance >= 10%
  const next6Hours = forecast.slice(0, 6);
  const firstRainyHour = next6Hours.find(hour => hour.precipitationProbability >= 10);
  
  const needsUmbrella = isCurrentlyRaining || !!firstRainyHour;

  return (
    <div className="glass-card p-6 animate-fade-in text-center" style={{ animationDelay: "0.1s" }}>
      <h3 className="text-base font-medium text-muted-foreground mb-4">
        {t('umbrella.question')}
      </h3>
      
      <div className="flex items-center justify-center">
        {needsUmbrella ? (
          <Umbrella className="h-20 w-20 text-weather-rain" />
        ) : (
          <UmbrellaOff className="h-20 w-20 text-muted-foreground" />
        )}
      </div>
      
      {needsUmbrella && (
        <p className="mt-3 text-muted-foreground">
          {isCurrentlyRaining 
            ? t('umbrella.raining')
            : firstRainyHour 
              ? formatString(t('umbrella.chanceAt'), firstRainyHour.precipitationProbability, format(firstRainyHour.time, "h a", { locale }))
              : null
          }
        </p>
      )}
    </div>
  );
}
