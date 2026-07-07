import { HourlyForecast as HourlyForecastType, DailyForecast as DailyForecastType } from "@/lib/weather";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceArea, ReferenceLine } from "recharts";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatInTimezone, appLocale } from "@/lib/utils";
import { useMemo, useCallback, memo } from "react";

interface HourlyForecastProps {
  forecast: HourlyForecastType[];
  daily?: DailyForecastType[];
  timezone?: string;
}

export const HourlyForecast = memo(({ forecast, daily, timezone }: HourlyForecastProps) => {
  const { language, t } = useLanguage();

  const hoursData = forecast.slice(0, 8);
  const locale = appLocale(language);

  // Format time in the city's timezone
  const formatTimeInTimezone = useCallback((date: Date) => {
    return formatInTimezone(date, locale, {
      hour: 'numeric',
      hour12: true,
      timeZone: timezone || undefined,
    });
  }, [timezone, locale]);

  const chartData = hoursData.map((hour, index) => ({
    time: (hour.time instanceof Date) ? hour.time.getTime() : new Date(hour.time).getTime(),
    displayTime: index === 0 ? t('hourly.now') : formatTimeInTimezone(hour.time instanceof Date ? hour.time : new Date(hour.time)),
    temperature: Math.round(hour.temperature),
    rainChance: hour.precipitationProbability,
    rainIntensity: hour.precipitation,
    windSpeed: hour.windSpeed,
    windDirection: hour.windDirection,
    isDay: hour.isDay,
  }));

  // Format sunrise/sunset time in the city's timezone
  const formatSunTime = useCallback((date: Date) => {
    return formatInTimezone(date, locale, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone || undefined,
    });
  }, [timezone, locale]);

  // Find sunrise/sunset times within the forecast window
  const sunEvents = useMemo(() => {
    if (!daily || daily.length === 0 || hoursData.length === 0) return [];

    const events: { time: number; type: 'sunrise' | 'sunset'; label: string; timeLabel: string }[] = [];
    const startTime = (hoursData[0].time instanceof Date) ? hoursData[0].time.getTime() : new Date(hoursData[0].time).getTime();
    const endTime = (hoursData[hoursData.length - 1].time instanceof Date) ? hoursData[hoursData.length - 1].time.getTime() : new Date(hoursData[hoursData.length - 1].time).getTime();

    daily.slice(0, 2).forEach(day => {
      const sunrise = day.sunrise instanceof Date ? day.sunrise : new Date(day.sunrise);
      const sunset = day.sunset instanceof Date ? day.sunset : new Date(day.sunset);

      if (!isNaN(sunrise.getTime())) {
        const sunriseTime = sunrise.getTime();
        if (sunriseTime >= startTime && sunriseTime <= endTime) {
          events.push({
            time: sunriseTime,
            type: 'sunrise',
            label: '☀︎',
            timeLabel: formatSunTime(sunrise)
          });
        }
      }
      if (!isNaN(sunset.getTime())) {
        const sunsetTime = sunset.getTime();
        if (sunsetTime >= startTime && sunsetTime <= endTime) {
          events.push({
            time: sunsetTime,
            type: 'sunset',
            label: '☾',
            timeLabel: formatSunTime(sunset)
          });
        }
      }
    });

    return events;
  }, [daily, hoursData, formatSunTime]);

  // Calculate day/night periods for reference areas based on isDay from hourly data
  const dayNightAreas = useMemo(() => {
    const areas: { x1: number; x2: number; isDay: boolean }[] = [];
    const dataPoints = chartData;

    if (dataPoints.length < 2) return [];

    let currentPeriodStart = 0;
    let currentIsDay = dataPoints[0].isDay;

    for (let i = 1; i < dataPoints.length; i++) {
      if (dataPoints[i].isDay !== currentIsDay) {
        areas.push({
          x1: dataPoints[currentPeriodStart].time,
          x2: dataPoints[i - 1].time,
          isDay: currentIsDay,
        });
        currentPeriodStart = i;
        currentIsDay = dataPoints[i].isDay;
      }
    }

    // Add the last period
    areas.push({
      x1: dataPoints[currentPeriodStart].time,
      x2: dataPoints[dataPoints.length - 1].time,
      isDay: currentIsDay,
    });

    return areas;
  }, [chartData]);

  // Custom tick formatter for x-axis
  const formatXAxisTick = useCallback((timestamp: number, index: number) => {
    if (index === 0) return t('hourly.now');
    return formatTimeInTimezone(new Date(timestamp));
  }, [t, formatTimeInTimezone]);

  // Format time for tooltip label
  const formatTooltipLabel = useCallback((timestamp: number) => {
    return formatInTimezone(new Date(timestamp), locale, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone || undefined,
    });
  }, [timezone, locale]);

  return (
    <div className="glass-card p-4 flex flex-col h-[350px] animate-fade-in" style={{ animationDelay: "0.2s" }}>
      <h3 className="text-base font-medium text-muted-foreground mb-4 px-2">
        {t('hourly.title')}
      </h3>

      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 25, right: 10, left: 0, bottom: 10 }}>
            {/* Day/night background areas */}
            {dayNightAreas.map((area, index) => (
              <ReferenceArea
                key={index}
                x1={area.x1}
                x2={area.x2}
                fill={area.isDay ? "hsl(48 96% 53% / 0.7)" : "hsl(222 47% 30% / 0.7)"}
                fillOpacity={1}
              />
            ))}
            {/* Sunrise/sunset markers */}
            {sunEvents.map((event, index) => (
              <ReferenceLine
                key={`sun-${index}`}
                x={event.time}
                yAxisId="left"
                stroke={event.type === 'sunrise' ? "hsl(var(--weather-sunny))" : "hsl(250 60% 60%)"}
                strokeDasharray="3 3"
                strokeWidth={1.5}
                label={{
                  value: `${event.label} ${event.timeLabel}`,
                  position: 'top',
                  fill: event.type === 'sunrise' ? "hsl(var(--weather-sunny))" : "hsl(250 60% 60%)",
                  fontSize: 12,
                  fontWeight: 600,
                  offset: 8,
                }}
              />
            ))}
            <XAxis
              dataKey="time"
              type="number"
              domain={['dataMin', 'dataMax']}
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 14 }}
              tickFormatter={formatXAxisTick}
              ticks={chartData.map(d => d.time)}
            />
            <YAxis
              yAxisId="left"
              domain={['dataMin - 2', 'dataMax + 2']}
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--weather-sunny))', fontSize: 14 }}
              tickFormatter={(value) => `${value}°`}
              width={45}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--weather-rain))', fontSize: 12 }}
              tickFormatter={(value) => `${value}%`}
              width={35}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
              labelFormatter={(value: number) => formatTooltipLabel(value)}
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md" style={{ backgroundColor: 'hsl(var(--card))' }}>
                      <p className="font-medium text-foreground mb-1">{formatTooltipLabel(label)}</p>
                      <div className="space-y-1">
                        <p className="text-weather-sunny flex justify-between gap-4">
                          <span>{t('hourly.temperature')}:</span>
                          <span className="font-semibold">{data.temperature}°</span>
                        </p>
                        <p className="text-weather-rain flex justify-between gap-4">
                          <span>{t('hourly.rainChance')}:</span>
                          <span className="font-semibold">{data.rainChance}% {data.rainIntensity > 0 ? `(${data.rainIntensity}mm)` : ''}</span>
                        </p>
                        <div className="text-sky-400 flex justify-between gap-4">
                          <span>{t('weather.wind')}:</span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold">{Math.round(data.windSpeed)} {t('unit.kmh')}</span>
                            <div style={{ transform: `rotate(${data.windDirection}deg)` }} className="inline-block transition-transform duration-500">
                              <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[8px] border-b-sky-400" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="temperature"
              stroke="hsl(var(--weather-sunny))"
              strokeWidth={2}
              dot={{ fill: 'hsl(var(--weather-sunny))', strokeWidth: 0, r: 4 }}
              activeDot={{ r: 6, fill: 'hsl(var(--weather-sunny))' }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="rainChance"
              stroke="hsl(var(--weather-rain))"
              strokeWidth={2}
              dot={{ fill: 'hsl(var(--weather-rain))', strokeWidth: 0, r: 4 }}
              activeDot={{ r: 6, fill: 'hsl(var(--weather-rain))' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
