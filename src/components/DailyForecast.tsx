import { DailyForecast as DailyForecastType, getWeatherIcon, getWeatherDescription } from "@/lib/weather";
import { format, isToday, isTomorrow } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Droplets } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { memo } from "react";

interface DailyForecastProps {
  forecast: DailyForecastType[];
}

export const DailyForecast = memo(({ forecast }: DailyForecastProps) => {
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
              className="flex items-center px-2 py-3 rounded-xl hover:bg-secondary/30 transition-colors"
            >
              {/* Date + Day inline */}
              <div className="w-24 flex items-baseline gap-1.5 shrink-0">
                <span className="text-sm text-muted-foreground">{format(day.date, "d/M")}</span>
                <span className="text-base font-medium">{formatDay(day.date)}</span>
              </div>

              {/* Weather icon */}
              <div className="w-10 text-center shrink-0">
                <span className="text-2xl" role="img" aria-label={getWeatherDescription(day.weatherCode)}>
                  {getWeatherIcon(day.weatherCode, true)}
                </span>
              </div>

              {/* Rain probability */}
              <div className="w-14 flex items-center gap-1 shrink-0">
                {(showPSR || showPercentage) && (
                  <>
                    <Droplets className="h-3.5 w-3.5 text-weather-rain flex-shrink-0" aria-hidden="true" />
                    <span className="text-xs text-weather-rain truncate" aria-label={`Precipitation probability: ${showPSR ? day.precipitationProbabilityRaw : `${day.precipitationProbabilityMax}%`}`}>
                      {showPSR ? day.precipitationProbabilityRaw : `${day.precipitationProbabilityMax}%`}
                    </span>
                  </>
                )}
              </div>

              {/* Min temp */}
              <span className="w-10 text-right text-sm text-muted-foreground shrink-0">
                {Math.round(day.temperatureMin)}°
              </span>

              {/* Temp bar */}
              <div
                className="flex-1 h-1.5 bg-secondary/50 rounded-full overflow-hidden relative mx-2 min-w-[60px]"
                role="progressbar"
                aria-valuemin={weekMin}
                aria-valuemax={weekMax}
                aria-valuenow={day.temperatureMax}
                aria-label={`Temperature range: ${Math.round(day.temperatureMin)} to ${Math.round(day.temperatureMax)} degrees`}
              >
                <div
                  className="absolute h-full rounded-full bg-gradient-to-r from-weather-rain via-weather-sunny to-destructive"
                  style={{
                    left: `${minPercent}%`,
                    right: `${100 - maxPercent}%`,
                  }}
                />
              </div>

              {/* Max temp */}
              <span className="w-10 text-sm font-medium shrink-0">{Math.round(day.temperatureMax)}°</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
