import { memo } from 'react';
import {
  DailyForecast as DailyForecastType,
  getWeatherIconNode,
  weatherDescriptionKey,
} from '@/lib/weather';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUnits } from '@/contexts/UnitsContext';
import { formatTemperature, formatWindSpeed } from '@/lib/units';
import type { Units } from '@/lib/units';
import { SENTINEL_THRESHOLD } from '@/lib/constants';
import { ChevronDown, Droplets, Wind } from 'lucide-react';

/**
 * "Today + tomorrow at a glance" — a thin, low-weight strip summarising
 * daily[0] and daily[1] in the same per-day format (temp range, rain chance
 * when ≥ 20 %, max wind). Sits between the hero section and the hourly/daily
 * split on desktop, and above the swipe deck on mobile so it is glanceable
 * from the first screen. Activating the strip reveals the full DailyForecast
 * (desktop scroll / mobile deck advance).
 *
 * Each day is one flex group: [kicker, icon, low/high, rain ≥ 20 %, wind] —
 * the range reads low → high, matching the hero caption.
 * The groups share a line when they fit and wrap to one line per day when
 * they don't — the whole row is still a single button. The chevron lives
 * inside the last day's group so it never dangles alone on a wrapped line.
 * The wind group hides below 360 px (the strip then reads icon + temp per
 * day); the chevron still signals "more". The button's aria-label spells
 * out a full sentence per day (joined by "; ") so screen readers never
 * hear a bare "80 %" or "25 km/h" without context.
 */
export const AtAGlance = memo(
  ({ today, tomorrow, onReveal }: AtAGlanceProps) => {
    const { t } = useLanguage();
    const { units } = useUnits();

    // Days that are summarisable: a missing row (short/partial forecast) or
    // sentinel temps (no-data placeholder) skip that day; no summarisable
    // day at all → render nothing.
    const days = [
      { label: t('daily.today'), forecast: today },
      { label: t('daily.tomorrow'), forecast: tomorrow },
    ].filter(
      (d): d is { label: string; forecast: DailyForecastType } =>
        !!d.forecast &&
        d.forecast.temperatureMax >= SENTINEL_THRESHOLD &&
        d.forecast.temperatureMin >= SENTINEL_THRESHOLD,
    );

    if (days.length === 0) return null;

    return (
      <button
        type="button"
        onClick={onReveal}
        aria-label={days
          .map((d) => summarizeSentence(d.forecast, d.label, t, units))
          .join('; ')}
        className="flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-2 border border-border bg-card px-4 py-2 text-xs tabular-nums text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {days.map((d, i) => (
          <DaySegment
            key={d.label}
            label={d.label}
            forecast={d.forecast}
            units={units}
            separator={i > 0}
            chevron={i === days.length - 1}
          />
        ))}
      </button>
    );
  },
);

AtAGlance.displayName = 'AtAGlance';

interface AtAGlanceProps {
  /** Today's daily row (`daily[0]`). Missing/sentinel days are skipped. */
  today?: DailyForecastType;
  /** Tomorrow's daily row (`daily[1]`). Missing/sentinel days are skipped. */
  tomorrow?: DailyForecastType;
  /** Reveals the full daily forecast (scroll-to on desktop, deck advance on mobile). */
  onReveal: () => void;
}

/** One day's strip content: kicker, icon, low/high, rain (≥ 20 %), wind,
 *  and optionally the `·` that separates it from the previous day plus the
 *  trailing chevron (last day only). */
function DaySegment({
  label,
  forecast,
  units,
  separator,
  chevron,
}: {
  label: string;
  forecast: DailyForecastType;
  units: Units;
  separator: boolean;
  chevron: boolean;
}) {
  const { t } = useLanguage();
  const Icon = getWeatherIconNode(forecast.weatherCode, true);
  const high = formatTemperature(forecast.temperatureMax, units);
  const low = formatTemperature(forecast.temperatureMin, units);
  const wind = formatWindSpeed(forecast.windSpeedMax, units);
  const windUnit = t(units === 'us' ? 'unit.mph' : 'unit.kmh', units === 'us' ? 'mph' : 'km/h');
  // Mirror the hourly-chart rain encoding: only signal a rain chance at or
  // above 20 %; below that the segment is skipped entirely (keeps the
  // single line clean — a checkmark would read as noise next to icons).
  const showPrecip = forecast.precipitationProbabilityMax >= 20;
  const precipPct = Math.round(forecast.precipitationProbabilityMax);

  return (
    <span className="inline-flex items-center gap-x-3">
      {separator && <span aria-hidden="true">·</span>}
      <span className="kicker">{label}</span>
      <Icon
        className="h-4 w-4 shrink-0 text-foreground"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <span className="inline-flex items-center gap-x-1.5 text-foreground/90">
        {low}
        <span aria-hidden="true">/</span>
        {high}
      </span>
      {showPrecip && (
        <span className="inline-flex items-center gap-x-1.5 text-weather-rain">
          <span aria-hidden="true">·</span>
          <Droplets className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          {precipPct}%
        </span>
      )}
      <span className="inline-flex items-center gap-x-1.5 max-[360px]:hidden">
        <span aria-hidden="true">·</span>
        <Wind className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        {wind} {windUnit}
      </span>
      {chevron && (
        <ChevronDown
          className="h-3.5 w-3.5 text-muted-foreground/70"
          aria-hidden="true"
        />
      )}
    </span>
  );
}

/** Screen-reader sentence for one day: "Tomorrow: Partly cloudy, High 31°C,
 *  Low 25°C, Rain Chance 80%, Wind 25 km/h". The visible segments mirror
 *  this sentence (rain clause omitted below 20 %). */
function summarizeSentence(
  forecast: DailyForecastType,
  label: string,
  t: (key: string, fallback?: string) => string,
  units: Units,
): string {
  const high = formatTemperature(forecast.temperatureMax, units);
  const low = formatTemperature(forecast.temperatureMin, units);
  const wind = formatWindSpeed(forecast.windSpeedMax, units);
  const windUnit = t(units === 'us' ? 'unit.mph' : 'unit.kmh', units === 'us' ? 'mph' : 'km/h');
  const showPrecip = forecast.precipitationProbabilityMax >= 20;
  const precipPct = Math.round(forecast.precipitationProbabilityMax);
  return [
    `${label}: ${t(weatherDescriptionKey(forecast.weatherCode))}`,
    `${t('daily.high')} ${high}`,
    `${t('daily.low')} ${low}`,
    ...(showPrecip ? [`${t('hourly.rainChance')} ${precipPct}%`] : []),
    `${t('weather.wind')} ${wind} ${windUnit}`,
  ].join(', ');
}
