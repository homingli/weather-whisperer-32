import { DailyForecast as DailyForecastType, getWeatherIcon, getWeatherDescription } from "@/lib/weather";
import { format, isToday, isTomorrow } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Droplets } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface DailyForecastProps {
  forecast: DailyForecastType[];
}

export function DailyForecast({ forecast }: DailyForecastProps) {
  const { language, t } = useLanguage();
  const locale = language === 'tc' ? zhTW : undefined;

  const formatDay = (date: Date) => {
    if (isToday(date)) return t('daily.today');
    if (isTomorrow(date)) return t('daily.tomorrow');
    return format(date, "EEE", { locale });
  };

  // Find min and max temps for the week to calculate bar widths
  const allTemps = forecast.flatMap(d => [d.temperatureMin, d.temperatureMax]);
  const weekMin = Math.min(...allTemps);
  const weekMax = Math.max(...allTemps);
  const tempRange = weekMax - weekMin;

  return (
    <div className="glass-card p-4 animate-fade-in" style={{ animationDelay: "0.3s" }}>
      <h3 className="text-base font-medium text-muted-foreground mb-4 px-2">
        {t('daily.title')}
      </h3>
      
      <div className="space-y-1">
        {forecast.map((day) => {
          const minPercent = ((day.temperatureMin - weekMin) / tempRange) * 100;
          const maxPercent = ((day.temperatureMax - weekMin) / tempRange) * 100;
          // Show PSR text if available (HKO data), otherwise show percentage
          const showPSR = day.precipitationProbabilityRaw;
          const showPercentage = !showPSR && day.precipitationProbabilityMax > 0;

          return (
            <div
              key={day.date.toISOString()}
              className="flex items-center gap-4 px-2 py-3 rounded-xl hover:bg-secondary/30 transition-colors"
            >
              <div className="w-28 text-base">
                <span className="text-muted-foreground">{format(day.date, "d/M")}</span>
                <span className="font-medium ml-1">{formatDay(day.date)}</span>
              </div>
              
              <span className="text-3xl w-12 text-center">{getWeatherIcon(day.weatherCode, true)}</span>
              
              <div className="flex items-center gap-1 w-16">
                {(showPSR || showPercentage) && (
                  <>
                    <Droplets className="h-4 w-4 text-weather-rain flex-shrink-0" />
                    <span className="text-sm text-weather-rain truncate">
                      {showPSR ? day.precipitationProbabilityRaw : `${day.precipitationProbabilityMax}%`}
                    </span>
                  </>
                )}
              </div>
              
              <span className="w-12 text-right text-base text-muted-foreground">
                {Math.round(day.temperatureMin)}°
              </span>
              
              <div className="flex-1 h-2 bg-secondary/50 rounded-full overflow-hidden relative">
                <div
                  className="absolute h-full rounded-full bg-gradient-to-r from-weather-rain via-weather-sunny to-destructive"
                  style={{
                    left: `${minPercent}%`,
                    right: `${100 - maxPercent}%`,
                  }}
                />
              </div>
              
              <span className="w-12 text-base font-medium">{Math.round(day.temperatureMax)}°</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
