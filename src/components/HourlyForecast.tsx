import { HourlyForecast as HourlyForecastType } from "@/lib/weather";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { useLanguage } from "@/contexts/LanguageContext";

interface HourlyForecastProps {
  forecast: HourlyForecastType[];
}

export function HourlyForecast({ forecast }: HourlyForecastProps) {
  const { language, t } = useLanguage();
  const locale = language === 'tc' ? zhTW : undefined;

  const chartData = forecast.slice(0, 6).map((hour, index) => ({
    time: index === 0 ? t('hourly.now') : format(hour.time, "ha", { locale }),
    temperature: Math.round(hour.temperature),
    rainChance: hour.precipitationProbability,
  }));

  return (
    <div className="glass-card p-4 animate-fade-in" style={{ animationDelay: "0.2s" }}>
      <h3 className="text-sm font-medium text-muted-foreground mb-4 px-2">
        {t('hourly.title')}
      </h3>
      
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 50, left: 0, bottom: 10 }}>
            <XAxis 
              dataKey="time" 
              axisLine={false} 
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
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
