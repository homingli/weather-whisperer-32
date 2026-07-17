import { DailyForecast as DailyForecastType, getWeatherIcon, getWeatherDescription } from "@/lib/weather";
import { addDays } from "date-fns";
import { Droplets } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { translatePsr } from "@/lib/hko-weather";
import { getDateTimeFormatter, formatInTimezone, appLocale } from "@/lib/utils";
import { useMemo, useCallback, memo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface DailyForecastProps {
  forecast: DailyForecastType[];
  timezone?: string;
}

function ymdInTimezone(date: Date, timeZone: string): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) return "";
  return getDateTimeFormatter("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function tomorrowYmdInTimezone(timeZone: string): string {
  const today = ymdInTimezone(new Date(), timeZone);
  if (!today) return "";
  const [y, m, d] = today.split("-").map(Number);
  const noon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const next = addDays(noon, 1);
  return getDateTimeFormatter("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(next);
}

export const DailyForecast = memo(({ forecast, timezone }: DailyForecastProps) => {
  const { language, t } = useLanguage();
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const formatDayLine1 = useCallback(
    (inputDate: Date | string): string => {
      const dayDate = inputDate instanceof Date ? inputDate : new Date(inputDate);
      if (isNaN(dayDate.getTime())) return "";

      try {
        const dayYmd = ymdInTimezone(dayDate, tz);
        const todayYmd = ymdInTimezone(new Date(), tz);
        if (dayYmd && dayYmd === todayYmd) return t("daily.today");
        const tomorrowYmd = tomorrowYmdInTimezone(tz);
        if (dayYmd && dayYmd === tomorrowYmd) return t("daily.tomorrow");

        return formatInTimezone(dayDate, appLocale(language), {
          timeZone: tz,
          weekday: "short",
        });
      } catch {
        return "";
      }
    },
    [tz, t, language]
  );

  const formatDayLine2 = useCallback(
    (inputDate: Date | string): string => {
      const dayDate = inputDate instanceof Date ? inputDate : new Date(inputDate);
      if (isNaN(dayDate.getTime())) return "";
      return formatInTimezone(dayDate, appLocale(language), {
        timeZone: tz,
        month: "numeric",
        day: "numeric",
      });
    },
    [tz, language]
  );

  const { chartData, yDomainMin, yDomainMax } = useMemo(() => {
    const allTemps = forecast.flatMap((d) => [d.temperatureMin, d.temperatureMax]);
    const weekMin = Math.min(...allTemps);
    const weekMax = Math.max(...allTemps);
    const pad = 2;
    const yMin = weekMin - pad;
    const yMax = weekMax + pad;

    const rows = forecast.map((day, index) => {
      const low = Math.round(day.temperatureMin);
      const high = Math.round(day.temperatureMax);
      const showPSR = day.precipitationProbabilityRaw;
      const showPercentage = !showPSR && day.precipitationProbabilityMax > 0;
      return {
        index,
        temperatureRange: [low, high], // Use floating bar array
        temperatureMin: low,
        temperatureMax: high,
        weatherCode: day.weatherCode,
        windSpeedMax: day.windSpeedMax,
        windDirectionDominant: day.windDirectionDominant,
        precipLabel: showPSR
          ? translatePsr(day.precipitationProbabilityRaw, language as 'en' | 'tc')
          : showPercentage
            ? `${day.precipitationProbabilityMax}%`
            : null,
        line1: formatDayLine1(day.date),
        line2: formatDayLine2(day.date),
      };
    });

    return { chartData: rows, yDomainMin: yMin, yDomainMax: yMax };
  }, [forecast, formatDayLine1, formatDayLine2]);

  return (
    <div className="glass-card p-4 flex flex-col h-[350px] animate-fade-in" style={{ animationDelay: "0.3s" }}>
      <h3 className="text-base font-medium text-muted-foreground mb-4 px-2">{t("daily.title")}</h3>
      
      <div className="grid grid-cols-7 mb-4 text-center">
        {chartData.map((row) => {
          const day = forecast[row.index];
          return (
            <div key={row.index} className="flex flex-col items-center gap-1 min-w-0 px-0.5">
              <span
                className="text-4xl leading-none"
                role="img"
                aria-label={getWeatherDescription(day.weatherCode)}
              >
                {getWeatherIcon(day.weatherCode, true)}
              </span>
              {row.precipLabel && (
                <div className="flex items-center justify-center gap-0.5 text-[10px] leading-tight text-weather-rain">
                  <Droplets className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="truncate max-w-full">{row.precipLabel}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 0, right: 8, left: 0, bottom: 8 }}
            barCategoryGap="18%"
          >
            <defs>
              {chartData.map((row) => {
                const height = row.temperatureMax - row.temperatureMin;
                const h = height === 0 ? 0.1 : height;
                const y1 = (row.temperatureMax - yDomainMin) / h;
                const y2 = (row.temperatureMax - yDomainMax) / h;
                return (
                  <linearGradient
                    key={`grad-${row.index}`}
                    id={`dailyTempRange-${row.index}`}
                    x1="0"
                    y1={y1}
                    x2="0"
                    y2={y2}
                  >
                    <stop offset="0%" stopColor="hsl(var(--weather-rain))" />
                    <stop offset="50%" stopColor="hsl(var(--weather-sunny))" />
                    <stop offset="100%" stopColor="hsl(var(--destructive))" />
                  </linearGradient>
                );
              })}
            </defs>
            <XAxis
              dataKey="index"
              type="category"
              orientation="top"
              axisLine={false}
              tickLine={false}
              tick={(props) => {
                const { x, y, payload } = props;
                const row = chartData[payload.value as number];
                if (!row) return null;
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text
                      textAnchor="middle"
                      fill="hsl(var(--muted-foreground))"
                      fontSize={11}
                      className="font-medium"
                    >
                      <tspan x={0} dy={-22}>
                        {row.line1}
                      </tspan>
                      <tspan x={0} dy={13} className="text-muted-foreground font-medium">
                        {row.line2}
                      </tspan>
                    </text>
                  </g>
                );
              }}
              height={40}
              interval={0}
            />
            <YAxis
              hide
              domain={[yDomainMin, yDomainMax]}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted) / 0.15)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as (typeof chartData)[number];
                if (!row) return null;
                return (
                  <div
                    className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md"
                    style={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                    }}
                  >
                    <p className="font-medium text-foreground mb-1">
                      {row.line1} · {row.line2}
                    </p>
                    <p className="text-muted-foreground">
                      {t("daily.low")}: {row.temperatureMin}° · {t("daily.high")}: {row.temperatureMax}°
                    </p>
                    {row.precipLabel && (
                      <p className="text-weather-rain mt-1 text-xs">
                        {t("daily.precip")}: {row.precipLabel}
                      </p>
                    )}
                    <div className="text-sky-400 mt-1 text-xs flex items-center justify-between">
                      <span>{t('weather.wind')}: {Math.round(row.windSpeedMax)} {t('unit.kmh')}</span>
                      <div style={{ transform: `rotate(${row.windDirectionDominant}deg)` }} className="inline-block transition-transform duration-500 ml-2">
                        <div className="w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-b-[6px] border-b-sky-400" />
                      </div>
                    </div>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="temperatureRange"
              radius={[6, 6, 6, 6]}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="temperatureMax"
                position="top"
                offset={8}
                style={{ fontSize: '13px', fill: 'hsl(var(--foreground))', fontWeight: 600 }}
                formatter={(val: number) => `${val}°`}
              />
              <LabelList
                dataKey="temperatureMin"
                position="bottom"
                offset={8}
                style={{ fontSize: '12px', fill: 'hsl(var(--muted-foreground))', fontWeight: 500 }}
                formatter={(val: number) => `${val}°`}
              />
              {chartData.map((row) => (
                <Cell key={`cell-${row.index}`} fill={`url(#dailyTempRange-${row.index})`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
