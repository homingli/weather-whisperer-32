import { HourlyForecast as HourlyForecastType, DailyForecast as DailyForecastType } from "@/lib/weather";
import { ComposedChart, Bar, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceArea, ReferenceLine } from "recharts";
import { useLanguage, formatString } from "@/contexts/LanguageContext";
import { useUnits } from "@/contexts/UnitsContext";
import {
  celsiusToFahrenheit,
  kmhToMph,
  mmToInches,
  temperatureUnitLabel,
  windSpeedUnitLabel,
  precipitationUnitLabel,
} from "@/lib/units";
import { formatInTimezone, appLocale } from "@/lib/utils";
import { STRONG_WIND_GUST_KMH } from "@/lib/constants";
import { useMemo, useCallback, memo, useRef } from "react";
import { ShareForecastButton } from "@/components/ShareForecastButton";

interface HourlyForecastProps {
  forecast: HourlyForecastType[];
  daily?: DailyForecastType[];
  timezone?: string;
  /** Display name of the selected city — used by the share button. */
  cityName?: string;
  /** Deep-link URL (origin + this location's coords) for the share button. */
  shareUrl?: string;
}

export const HourlyForecast = memo(({ forecast, daily, timezone, cityName, shareUrl }: HourlyForecastProps) => {
  const { language, t } = useLanguage();
  const { units } = useUnits();
  const root = useRef<HTMLDivElement>(null);

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
    // In US mode, plot in °F / mph so the temperature line traces the
    // actual value with full precision. Source data is decimal °C / km/h;
    // rounding to integer °C first (as we did for the daily chart) loses
    // precision and produces a stepped line — e.g. 20.4°C and 20.6°C
    // both round to 20, but the actual Fahrenheit reads 69°F and 69°F,
    // not 68°F. Keeping full precision through the chart and rounding
    // only at the label layer is the accurate path. (DailyForecast does
    // the opposite — keeps °C — because its bar gradient stops are
    // calibrated against °C thresholds; converting to °F would stretch
    // the y-domain and shift the gradient stops so every bar reads solid
    // red. Different chart, different tradeoff.)
    temperature: units === 'us' ? celsiusToFahrenheit(hour.temperature) : hour.temperature,
    rainChance: hour.precipitationProbability,
    rainIntensity: units === 'us' ? mmToInches(hour.precipitation) : hour.precipitation,
    windSpeed: units === 'us' ? kmhToMph(hour.windSpeed) : hour.windSpeed,
    // Gust kept in both scales: `windGustKmh` is the transport unit the
    // strong-wind threshold compares against, `windGust` is display-converted.
    windGustKmh: hour.windGust,
    windGust: hour.windGust != null ? (units === 'us' ? kmhToMph(hour.windGust) : hour.windGust) : undefined,
    windDirection: hour.windDirection,
    isDay: hour.isDay,
  }));

  // An hour whose forecast gust reaches Beaufort 7 territory shades the
  // chart for that span (see strongGustAreas below); the exact values live
  // in the tooltip and the sr-only table.
  const hasGustData = chartData.some((d) => d.windGust != null);

  // Contiguous strong-gust spans, as [startMs, endMs) chart coordinates.
  // A run of strong hours shades stamp-to-stamp like the day/night bands,
  // so adjacent hours merge into one region; the final hour's run extends
  // one hour past the last stamp (ifOverflow=extendDomain widens the domain
  // rather than clipping it).
  const strongGustAreas = useMemo(() => {
    const areas: { x1: number; x2: number }[] = [];
    let runStart: number | null = null;
    for (let i = 0; i < chartData.length; i++) {
      const d = chartData[i];
      const strong = (d.windGustKmh ?? 0) >= STRONG_WIND_GUST_KMH;
      if (strong && runStart == null) runStart = d.time;
      const isLast = i === chartData.length - 1;
      if (runStart != null && (!strong || isLast)) {
        // Only a run that still includes the final hour extends past the
        // last stamp; a run closed by a non-strong final hour ends there.
        areas.push({ x1: runStart, x2: isLast && strong ? d.time + 3_600_000 : d.time });
        runStart = null;
      }
    }
    return areas;
  }, [chartData]);

  // The band is a color-only cue — the chart's aria-label names the ranges
  // ("Strong gusts 2 PM–4 PM, 7 PM–8 PM") so the information doesn't ride
  // on hue alone. (SR users also get the gust column in the sr-only table.)
  const chartAriaLabel = useMemo(() => {
    if (strongGustAreas.length === 0) return t('hourly.chartLabel');
    const ranges = strongGustAreas
      .map((a) => {
        const from = formatTimeInTimezone(new Date(a.x1));
        // A band only exists because a chart point is in [x1, x2), so the
        // lookup always lands.
        const lastInRun = [...chartData].reverse().find((d) => d.time >= a.x1 && d.time < a.x2)!;
        const to = formatTimeInTimezone(new Date(lastInRun.time));
        return from === to ? from : `${from}–${to}`;
      })
      .join(language === 'tc' ? '，' : ', ');
    return `${t('hourly.chartLabel')}. ${formatString(t('hourly.strongGusts'), ranges)}`;
  }, [t, language, strongGustAreas, chartData, formatTimeInTimezone]);

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

  // Night spans from the actual sun times (daily sunrise/sunset) rather
  // than the hourly is_day flags: is_day can only flip on whole-hour
  // stamps, so a flag-driven band starts at e.g. 7 PM while the drawn
  // sunset marker says 6:04 PM. Anchoring to the sun times makes the
  // shading begin exactly at that marker line. Intervals are clipped to
  // the chart window, so no domain extension is needed.
  const nightAreas = useMemo(() => {
    if (!daily || daily.length === 0 || chartData.length === 0) return [];
    const winStart = chartData[0].time;
    const winEnd = chartData[chartData.length - 1].time;
    // HKO fallback seeds sunrise/sunset with epoch-0 sentinels; treat
    // non-finite and pre-1971 stamps alike as "no data".
    const toMs = (d: Date | string): number | null => {
      const t = (d instanceof Date) ? d.getTime() : new Date(d).getTime();
      return Number.isNaN(t) || t <= 0 ? null : t;
    };
    const areas: { x1: number; x2: number }[] = [];
    // Pre-dawn window: last night's sunset isn't in `daily` (it starts
    // today), so shade from the window start until today's sunrise.
    const sunrise0 = toMs(daily[0].sunrise);
    if (sunrise0 != null && sunrise0 > winStart) {
      areas.push({ x1: winStart, x2: Math.min(sunrise0, winEnd) });
    }
    // Each evening: sunset_i → sunrise_{i+1}. The next-day sunrise is
    // optional (daily carries 7 days in practice, but the last evening has
    // no follower) — it clips to the window end instead.
    for (let i = 0; i < daily.length; i++) {
      const set = toMs(daily[i].sunset);
      if (set == null) continue;
      const rise = toMs(daily[i + 1]?.sunrise);
      const x1 = Math.max(set, winStart);
      const x2 = Math.min(rise ?? winEnd, winEnd);
      if (x2 > x1) areas.push({ x1, x2 });
    }
    return areas;
  }, [daily, chartData]);

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

  // Entrance animation handled by @keyframes in src/index.css
  // (.hf-rule, .hf-chart) under @media (prefers-reduced-motion: no-preference).

  return (
    <div ref={root} className="editorial-card p-6 md:p-8 flex flex-col h-[420px]">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="kicker text-muted-foreground font-display leading-6">
          {t('hourly.title')}
        </h3>
        <div className="flex items-center gap-2">
          <span className="kicker text-muted-foreground/60">
            {formatString(t('hourly.nextNHours'), hoursData.length)}
          </span>
          <ShareForecastButton cityName={cityName ?? ''} mode="hourly" hours={hoursData} timezone={timezone} url={shareUrl} />
        </div>
      </div>

      <div className="hf-rule h-px editorial-rule mt-3 mb-4" />

      <div className="hf-chart flex-1 w-full min-h-0 touch-pan-y" aria-label={chartAriaLabel} role="img">
        <ResponsiveContainer width="100%" height="100%">
          {/* Rain chance is a per-hour probability, not a continuous series —
              encoding it as a second line on its own axis invites false
              line-crossing reads against the temperature trace. Bars anchored
              at 0 convey magnitude and read as discrete per-hour columns.
              The temp line renders after the bars so it stays on top; bars are
              translucent so a hot + stormy hour (80% bar running up behind a
              temp peak) never hides the trace. */}
          <ComposedChart data={chartData} margin={{ top: 25, right: 10, left: 0, bottom: 10 }}>
            {/* Night shading, anchored to the real sunset/sunrise times so
                the band starts at the drawn marker line instead of the next
                full-hour stamp. yAxisId is required: recharts binds every
                Reference* to axis id 0 by default, and this chart's axes
                are 'left'/'right' — without it the areas are silently
                dropped (this regressed the night bands once). */}
            {nightAreas.map((area, index) => (
              <ReferenceArea
                key={index}
                x1={area.x1}
                x2={area.x2}
                yAxisId="left"
                fill="hsl(222 47% 30% / 0.12)"
                fillOpacity={1}
              />
            ))}
            {/* Strong-gust bands — rendered after the night areas so the
                tint stacks on top. 15% blue-gray slate (user-tuned): quiet
                enough to sit under the rain bars, which recharts z-orders
                above reference areas. Gated at STRONG_WIND_GUST_KMH;
                exact values in tooltip + sr table. */}
            {strongGustAreas.map((area, index) => (
              <ReferenceArea
                key={`gust-${index}`}
                x1={area.x1}
                x2={area.x2}
                yAxisId="left"
                fill="hsl(208 24% 42% / 0.15)"
                fillOpacity={1}
                ifOverflow="extendDomain"
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
              tickFormatter={(value) => `${Math.round(value)}${temperatureUnitLabel(units)}`}
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
                borderRadius: '0',
                fontFamily: "'Playfair Display', serif",
              }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
              labelFormatter={(label) => formatTooltipLabel(Number(label))}
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  // data values are already in the active unit (see chartData
                  // mapping). Round + append unit suffix at the edge.
                  const windLabel = units === 'us' ? t('unit.mph', 'mph') : t('unit.kmh', 'km/h');
                  const precipLabel = units === 'us' ? t('unit.in', 'in') : 'mm';
                  const tempStr = `${data.temperature.toFixed(1)}${temperatureUnitLabel(units)}`;
                  const windStr = `${Math.round(data.windSpeed)} ${windLabel}`;
                  const precipStr = data.rainIntensity > 0
                    ? `${units === 'us' ? data.rainIntensity.toFixed(2) : data.rainIntensity.toFixed(1)} ${precipLabel}`
                    : '';
                  return (
                    <div className="rounded-none border border-border bg-card px-3 py-2 text-sm shadow-md" style={{ backgroundColor: 'hsl(var(--card))' }}>
                      <p className="font-medium text-foreground mb-1">{formatTooltipLabel(Number(label))}</p>
                      <div className="space-y-1">
                        {/* WCAG 1.4.3 — text-weather-sunny (yellow) on bg-card
                            (cream) failed contrast. Keep the line label in
                            text-foreground and convey the temperature "warmer"
                            tone via a small colored swatch. */}
                        <p className="text-foreground flex justify-between gap-4 items-center">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: 'hsl(var(--weather-sunny))' }} aria-hidden="true" />
                            {t('hourly.temperature')}:
                          </span>
                          <span className="font-semibold">{tempStr}</span>
                        </p>
                        <p className="text-foreground flex justify-between gap-4">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: 'hsl(var(--weather-rain))' }} aria-hidden="true" />
                            {t('hourly.rainChance')}:
                          </span>
                          <span className="font-semibold">{data.rainChance}% {precipStr && `(${precipStr})`}</span>
                        </p>
                        {/* WCAG 1.4.3 — text-sky-400 on bg-card failed contrast.
                            Keep the row text in text-foreground and use the
                            small sky swatch + arrow to convey "wind" tone. */}
                        <div className="text-foreground flex justify-between gap-4 items-center">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block h-2 w-2 rounded-sm bg-sky-400" aria-hidden="true" />
                            {t('weather.wind')}:
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold">{windStr}</span>
                            <div style={{ transform: `rotate(${data.windDirection}deg)` }} className="inline-block transition-transform duration-500">
                              <div className="w-0 h-0 border-l-4 border-l-transparent border-r-4 border-r-transparent border-b-8 border-b-sky-400" />
                            </div>
                          </div>
                        </div>
                        {data.windGust != null && (
                          <div className="text-foreground flex justify-between gap-4">
                            <span>{t('weather.windGust')}:</span>
                            <span className="font-semibold">{`${Math.round(data.windGust)} ${windLabel}`}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            {/* isAnimationActive={false} — Recharts animates on mount with
                JS, outside the CSS prefers-reduced-motion guard in index.css
                (the .hf-chart entrance IS guarded; this internal one wasn't).
                DailyForecast already disabled its bar animation. */}
            <Bar
              yAxisId="right"
              dataKey="rainChance"
              fill="hsl(var(--weather-rain))"
              fillOpacity={0.22}
              maxBarSize={24}
              isAnimationActive={false}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="temperature"
              stroke="hsl(var(--weather-sunny))"
              strokeWidth={2}
              dot={{ fill: 'hsl(var(--weather-sunny))', strokeWidth: 0, r: 4 }}
              activeDot={{ r: 6, fill: 'hsl(var(--weather-sunny))' }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Screen-reader-only data table — accessible alternative to the chart.
          Keyboard/screen-reader users get the same data without the visual
          encoding. Mirrors the chartData rows. The sr-only div (not on the
          table itself) matters: tables treat width/height as minimums, so the
          1px sr-only box grows to content size, and WebKit doesn't clip table
          boxes with clip-path — the caption then paints over the card's
          kicker on iOS. A wrapping div is a block box that clips reliably. */}
      <div className="sr-only">
        <table>
          <caption>{t('hourly.chartLabel')}</caption>
          <thead>
            <tr>
              <th scope="col">{language === 'tc' ? '時間' : 'Time'}</th>
              <th scope="col">{t('hourly.temperature')}</th>
              <th scope="col">{t('hourly.rainChance')}</th>
              <th scope="col">{t('weather.wind')}</th>
              {/* Column only when any row carries gust data — pre-gust cached
                  snapshots render the exact table that shipped before. */}
              {hasGustData && <th scope="col">{t('weather.windGust')}</th>}
            </tr>
          </thead>
          <tbody>
            {chartData.map((row, i) => (
              <tr key={`sr-hour-${i}`}>
                <th scope="row">{row.displayTime}</th>
                <td>{Math.round(row.temperature)}{temperatureUnitLabel(units)}</td>
                <td>
                  {row.rainChance}%
                  {row.rainIntensity > 0 ? ` (${units === 'us' ? row.rainIntensity.toFixed(2) : row.rainIntensity.toFixed(1)} ${precipitationUnitLabel(units)})` : ''}
                </td>
                <td>
                  {Math.round(row.windSpeed)} {windSpeedUnitLabel(units)}
                </td>
                {hasGustData && (
                  <td>
                    {row.windGust != null ? `${Math.round(row.windGust)} ${windSpeedUnitLabel(units)}` : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

HourlyForecast.displayName = 'HourlyForecast';