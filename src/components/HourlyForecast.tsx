import { HourlyForecast as HourlyForecastType, DailyForecast as DailyForecastType } from "@/lib/weather";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceArea, ReferenceLine } from "recharts";
import { useLanguage } from "@/contexts/LanguageContext";
import { useMemo } from "react";

interface HourlyForecastProps {
  forecast: HourlyForecastType[];
  daily?: DailyForecastType[];
}

export function HourlyForecast({ forecast, daily }: HourlyForecastProps) {
  const { language, t } = useLanguage();
  const locale = language === 'tc' ? zhTW : undefined;

  const hoursData = forecast.slice(0, 8);
  
  const chartData = hoursData.map((hour, index) => ({
    time: hour.time.getTime(),
    displayTime: index === 0 ? t('hourly.now') : format(hour.time, "ha", { locale }),
    temperature: Math.round(hour.temperature),
    rainChance: hour.precipitationProbability,
    isDay: hour.isDay,
  }));

  // Find sunrise/sunset times within the forecast window
  const sunEvents = useMemo(() => {
    if (!daily || daily.length === 0 || hoursData.length === 0) return [];
    
    const events: { time: number; type: 'sunrise' | 'sunset'; label: string }[] = [];
    const startTime = hoursData[0].time.getTime();
    const endTime = hoursData[hoursData.length - 1].time.getTime();
    
    daily.slice(0, 2).forEach(day => {
      if (day.sunrise) {
        const sunriseTime = day.sunrise.getTime();
        if (sunriseTime >= startTime && sunriseTime <= endTime) {
          events.push({
            time: sunriseTime,
            type: 'sunrise',
            label: language === 'tc' ? '日出' : '☀︎'
          });
        }
      }
      if (day.sunset) {
        const sunsetTime = day.sunset.getTime();
        if (sunsetTime >= startTime && sunsetTime <= endTime) {
          events.push({
            time: sunsetTime,
            type: 'sunset',
            label: language === 'tc' ? '日落' : '☾'
          });
        }
      }
    });
    
    return events;
  }, [daily, hoursData, language]);

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
  const formatXAxisTick = (timestamp: number, index: number) => {
    if (index === 0) return t('hourly.now');
    const date = new Date(timestamp);
    const hours = date.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${hour12}${ampm}`;
  };

  return (
    <div className="glass-card p-4 animate-fade-in" style={{ animationDelay: "0.2s" }}>
      <h3 className="text-sm font-medium text-muted-foreground mb-4 px-2">
        {t('hourly.title')}
      </h3>
      
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 50, left: 0, bottom: 10 }}>
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
              >
                <text
                  x={0}
                  y={-8}
                  textAnchor="middle"
                  fill={event.type === 'sunrise' ? "hsl(var(--weather-sunny))" : "hsl(250 60% 60%)"}
                  fontSize={11}
                  fontWeight={500}
                >
                  {event.label}
                </text>
              </ReferenceLine>
            ))}
            <XAxis 
              dataKey="time" 
              type="number"
              domain={['dataMin', 'dataMax']}
              axisLine={false} 
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              tickFormatter={formatXAxisTick}
              ticks={chartData.map(d => d.time)}
            />
            <YAxis 
              yAxisId="left"
              domain={['dataMin - 2', 'dataMax + 2']}
              axisLine={false} 
              tickLine={false}
              tick={{ fill: 'hsl(var(--weather-sunny))', fontSize: 12 }}
              tickFormatter={(value) => `${value}°`}
              width={40}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--weather-rain))', fontSize: 10 }}
              tickFormatter={(value) => `${value}%`}
              width={40}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--weather-rain))', fontSize: 10 }}
              tickFormatter={(value) => `${value}%`}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
              formatter={(value: number, name: string) => {
                if (name === 'temperature') {
                  return [`${value}°`, t('hourly.temperature')];
                }
                return [`${value}%`, t('hourly.rainChance')];
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
}
