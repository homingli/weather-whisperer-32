import { DailyForecast as DailyForecastType, getWeatherIconNode, weatherDescriptionKey } from "@/lib/weather";
import { addDays } from "date-fns";
import { Droplets } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUnits } from "@/contexts/UnitsContext";
import { formatTemperature, formatWindSpeed, windSpeedUnitLabel } from "@/lib/units";
import { translatePsr } from "@/lib/hko-weather";
import { getDateTimeFormatter, formatInTimezone, appLocale } from "@/lib/utils";
import { useMemo, useCallback, memo, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
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
  const { units } = useUnits();
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const root = useRef<HTMLDivElement>(null);

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
      // Keep chart data in metric scale (°C). The Y-axis is hidden, but
      // bar heights and gradient stops are calibrated against metric
      // thresholds (red-hot, yellow-warm, blue-cool). Converting the data
      // to °F would stretch the chart domain and shift the gradient stops
      // so every bar reads as solid red. Instead, labels convert at the
      // edge via `formatTemperature` / `formatWindSpeed`, accepting a
      // small label-vs-position offset (the °F value sits at the °C tick
      // mark) — visually acceptable for a hidden-axis chart.
      const low = Math.round(day.temperatureMin);
      const high = Math.round(day.temperatureMax);
      const showPSR = day.precipitationProbabilityRaw;
      const showPercentage = !showPSR && day.precipitationProbabilityMax > 0;
      return {
        index,
        temperatureRange: [low, high],
        temperatureMin: low,
        temperatureMax: high,
        weatherCode: day.weatherCode,
        windSpeedMax: Math.round(day.windSpeedMax),
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

  // GSAP entrance: rows rise + numerals fade in
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from(root.current?.querySelectorAll(".df-rule") ?? [], {
        scaleX: 0, transformOrigin: "left center", duration: 0.9, ease: "power3.inOut", stagger: 0.1, delay: 0.25,
      });
      gsap.from(root.current?.querySelector(".df-chart") ?? null, {
        autoAlpha: 0, y: 16, duration: 0.7, ease: "power2.out", delay: 0.45,
      });
    });
    return () => mm.revert();
  }, { scope: root });

  return (
    <div ref={root} className="editorial-card p-6 md:p-8 flex flex-col h-[420px]">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="kicker text-muted-foreground font-display text-lg">
          {t("daily.title")}
        </h3>
        <span className="kicker text-muted-foreground/60 text-sm">
          A look ahead
        </span>
      </div>

      <div className="df-rule h-px editorial-rule mt-3 mb-4" />

      <div className="grid grid-cols-7 mb-4 text-center">
        {chartData.map((row) => {
          const day = forecast[row.index];
          const Icon = getWeatherIconNode(day.weatherCode, true);
          return (
            <div key={row.index} className="flex flex-col items-center gap-1 min-w-0 px-0.5">
              <span
                className="inline-flex items-center justify-center text-foreground leading-none"
                role="img"
                aria-label={t(weatherDescriptionKey(day.weatherCode))}
              >
                <Icon className="h-8 w-8 md:h-9 md:w-9" strokeWidth={1.25} />
              </span>
              {row.precipLabel && (
                <div className="flex items-center justify-center gap-0.5 text-xs leading-tight text-weather-rain">
                  <Droplets className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate max-w-full">{row.precipLabel}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="df-chart flex-1 min-h-0 w-full min-w-0" aria-label={t('daily.chartLabel')} role="img">
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
                      fontSize={13}
                      className="font-medium"
                    >
                      <tspan x={0} dy={-24}>
                        {row.line1}
                      </tspan>
                      <tspan x={0} dy={15} className="text-muted-foreground/70 font-medium" fontSize={11}>
                        {row.line2}
                      </tspan>
                    </text>
                  </g>
                );
              }}
              height={44}
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
                    className="rounded-none border border-border bg-card px-3 py-2 text-base shadow-md font-display"
                    style={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                    }}
                  >
                    <p className="font-medium text-foreground mb-1">
                      {row.line1} · {row.line2}
                    </p>
                    <p className="text-muted-foreground">
                      {t("daily.low")}: {formatTemperature(row.temperatureMin, units)} · {t("daily.high")}: {formatTemperature(row.temperatureMax, units)}
                    </p>
                    {row.precipLabel && (
                      <p className="text-weather-rain mt-1 text-sm">
                        {t("daily.precip")}: {row.precipLabel}
                      </p>
                    )}
                    <div className="text-sky-400 mt-1 text-sm flex items-center justify-between">
                      <span>{t('weather.wind')}: {formatWindSpeed(row.windSpeedMax, units)} {windSpeedUnitLabel(units)}</span>
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
              radius={[2, 2, 2, 2]}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="temperatureMax"
                position="top"
                offset={8}
                style={{ fontSize: '15px', fill: 'hsl(var(--foreground))', fontWeight: 500, fontFamily: "'Playfair Display', serif" }}
                formatter={(val: number) => formatTemperature(val, units)}
              />
              <LabelList
                dataKey="temperatureMin"
                position="bottom"
                offset={8}
                style={{ fontSize: '14px', fill: 'hsl(var(--muted-foreground))', fontWeight: 400, fontFamily: "'Playfair Display', serif" }}
                formatter={(val: number) => formatTemperature(val, units)}
              />
              {chartData.map((row) => (
                <Cell key={`cell-${row.index}`} fill={`url(#dailyTempRange-${row.index})`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Screen-reader-only data table — accessible alternative to the chart.
          Mirrors the chartData rows. */}
      <table className="sr-only">
        <caption>{t('daily.chartLabel')}</caption>
        <thead>
          <tr>
            <th scope="col">{language === 'tc' ? '日期' : 'Date'}</th>
            <th scope="col">{t('daily.low')}</th>
            <th scope="col">{t('daily.high')}</th>
            <th scope="col">{t('daily.precip')}</th>
            <th scope="col">{t('weather.wind')}</th>
          </tr>
        </thead>
        <tbody>
          {chartData.map((row, i) => (
            <tr key={`sr-day-${i}`}>
              <th scope="row">{`${row.line1} ${row.line2}`}</th>
              <td>{formatTemperature(row.temperatureMin, units)}</td>
              <td>{formatTemperature(row.temperatureMax, units)}</td>
              <td>{row.precipLabel ?? '—'}</td>
              <td>{`${formatWindSpeed(row.windSpeedMax, units)} ${windSpeedUnitLabel(units)}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

DailyForecast.displayName = 'DailyForecast';