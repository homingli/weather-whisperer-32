import { DailyForecast as DailyForecastType, getWeatherIcon, getWeatherDescription } from "@/lib/weather";
import { addDays } from "date-fns";
import { Droplets } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useMemo, useCallback, memo } from "react";
import {
  Bar,
  BarChart,
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
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function tomorrowYmdInTimezone(timeZone: string): string {
  const today = ymdInTimezone(new Date(), timeZone);
  const [y, m, d] = today.split("-").map(Number);
  const noon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const next = addDays(noon, 1);
  return new Intl.DateTimeFormat("en-CA", {
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
    (dayDate: Date): string => {
      const dayYmd = ymdInTimezone(dayDate, tz);
      const todayYmd = ymdInTimezone(new Date(), tz);
      if (dayYmd === todayYmd) return t("daily.today");
      if (dayYmd === tomorrowYmdInTimezone(tz)) return t("daily.tomorrow");
      return new Intl.DateTimeFormat(language === "tc" ? "zh-HK" : "en-US", {
        timeZone: tz,
        weekday: "short",
      }).format(dayDate);
    },
    [tz, t, language]
  );

  const formatDayLine2 = useCallback(
    (dayDate: Date): string =>
      new Intl.DateTimeFormat(language === "tc" ? "zh-HK" : "en-US", {
        timeZone: tz,
        month: "numeric",
        day: "numeric",
      }).format(dayDate),
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
      const spacer = low - yMin;
      const range = high - low;
      const showPSR = day.precipitationProbabilityRaw;
      const showPercentage = !showPSR && day.precipitationProbabilityMax > 0;
      return {
        index,
        spacer,
        range,
        temperatureMin: low,
        temperatureMax: high,
        weatherCode: day.weatherCode,
        precipLabel: showPSR
          ? day.precipitationProbabilityRaw
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
    <div className="glass-card p-4 animate-fade-in" style={{ animationDelay: "0.3s" }}>
      <h3 className="text-base font-medium text-muted-foreground mb-4 px-2">{t("daily.title")}</h3>

      <div className="h-64 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
            barCategoryGap="18%"
          >
            <defs>
              <linearGradient id="dailyTempRange" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="hsl(var(--weather-rain))" />
                <stop offset="50%" stopColor="hsl(var(--weather-sunny))" />
                <stop offset="100%" stopColor="hsl(var(--destructive))" />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="index"
              type="category"
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
                      <tspan x={0} dy={0}>
                        {row.line1}
                      </tspan>
                      <tspan x={0} dy={13} className="text-muted-foreground/90">
                        {row.line2}
                      </tspan>
                    </text>
                  </g>
                );
              }}
              height={48}
              interval={0}
            />
            <YAxis
              domain={[yDomainMin, yDomainMax]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "hsl(var(--weather-sunny))", fontSize: 12 }}
              tickFormatter={(value) => `${value}°`}
              width={40}
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
                  </div>
                );
              }}
            />
            <Bar dataKey="spacer" stackId="range" fill="transparent" isAnimationActive={false} />
            <Bar
              dataKey="range"
              stackId="range"
              fill="url(#dailyTempRange)"
              radius={[6, 6, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-7 gap-1 mt-3 px-0.5 text-center">
        {chartData.map((row) => {
          const day = forecast[row.index];
          return (
            <div key={row.index} className="flex flex-col items-center gap-1 min-w-0">
              <span
                className="text-xl leading-none"
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
    </div>
  );
});
