import { memo } from 'react';
import {
  DailyForecast as DailyForecastType,
  getWeatherIconNode,
  weatherDescriptionKey,
} from '@/lib/weather';
import { useLanguage, formatString } from '@/contexts/LanguageContext';
import { useUnits } from '@/contexts/UnitsContext';
import { formatTemperature } from '@/lib/units';
import type { Units } from '@/lib/units';
import { SENTINEL_THRESHOLD } from '@/lib/constants';
import { Droplets } from 'lucide-react';

/**
 * "Today + tomorrow at a glance" — a thin, low-weight strip summarising
 * daily[0] and daily[1] in the same per-day format (temp range, rain chance
 * when ≥ 20 %). Sits between the hero section and the hourly/daily split on
 * desktop, and above the swipe deck on mobile so it is glanceable from the
 * first screen.
 *
 * Two kinds of controls share the row:
 *  - Each day's temperature group is a button that reveals the full
 *    DailyForecast (desktop scroll / mobile deck advance).
 *  - Each rain chip (≥ 20 %) is its own button that jumps to the nowcast
 *    pane, where the 2-hour radar-based forecast lives. Without an
 *    `onRevealNowcast` (city outside nowcast coverage) the chip degrades to
 *    static text.
 *
 * There is deliberately no chevron: the strip reads as two plain controls
 * rather than a "more below" affordance.
 *
 * Layout: the groups share a line when they fit and wrap to one line per
 * day when they don't. Each control's `·` separator travels inside it
 * (aria-hidden) so a wrapped line never ends with a dangling dot. Buttons
 * carry full-sentence `aria-label`s so screen readers never hear a bare
 * "80 %" without context.
 */
export const AtAGlance = memo(
  ({ today, tomorrow, onReveal, onRevealNowcast }: AtAGlanceProps) => {
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
      <div className="flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-2 border border-border bg-card px-4 py-2 text-xs tabular-nums text-muted-foreground">
        {days.map((d, i) => (
          <DayGroup
            key={d.label}
            label={d.label}
            forecast={d.forecast}
            units={units}
            separator={i > 0}
            onReveal={onReveal}
            onRevealNowcast={onRevealNowcast}
          />
        ))}
      </div>
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
  /** Jumps to the nowcast pane (map slide / section scroll). Absent when the
   *  city is outside nowcast coverage — rain chips then render as static text. */
  onRevealNowcast?: () => void;
}

/** One day's strip content: a temperature button (kicker, icon, low/high)
 *  optionally followed by its rain chip. */
function DayGroup({
  label,
  forecast,
  units,
  separator,
  onReveal,
  onRevealNowcast,
}: {
  label: string;
  forecast: DailyForecastType;
  units: Units;
  separator: boolean;
  onReveal: () => void;
  onRevealNowcast?: () => void;
}) {
  const { t } = useLanguage();
  // Mirror the hourly-chart rain encoding: only signal a rain chance at or
  // above 20 %; below that the chip is skipped entirely (keeps the single
  // line clean — a checkmark would read as noise next to icons).
  const showPrecip = forecast.precipitationProbabilityMax >= 20;
  const precipPct = Math.round(forecast.precipitationProbabilityMax);
  const Icon = getWeatherIconNode(forecast.weatherCode, true);
  const high = formatTemperature(forecast.temperatureMax, units);
  const low = formatTemperature(forecast.temperatureMin, units);

  return (
    <span className="inline-flex items-center gap-x-3">
      <button
        type="button"
        onClick={onReveal}
        aria-label={`${label}: ${t(weatherDescriptionKey(forecast.weatherCode))}, ${t('daily.high')} ${high}, ${t('daily.low')} ${low}`}
        className="inline-flex items-center gap-x-3 px-1.5 py-1 -mx-1.5 -my-1 rounded hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
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
      </button>
      {showPrecip && (
        <RainChip
          pct={precipPct}
          clickable={!!onRevealNowcast}
          onRevealNowcast={onRevealNowcast}
        />
      )}
    </span>
  );
}

/** The rain chance chip. A real button (navigating to the nowcast pane)
 *  when the pane is reachable; static text otherwise. The leading `·`
 *  travels with the chip so a wrapped line never starts with a bare "80 %". */
function RainChip({
  pct,
  clickable,
  onRevealNowcast,
}: {
  pct: number;
  clickable: boolean;
  onRevealNowcast?: () => void;
}) {
  const { t } = useLanguage();
  const content = (
    <>
      <span aria-hidden="true">·</span>
      <Droplets className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
      {pct}%
    </>
  );

  if (!clickable) {
    return (
      <span className="inline-flex items-center gap-x-1.5 text-weather-rain">{content}</span>
    );
  }

  return (
    <button
      type="button"
      onClick={onRevealNowcast}
      aria-label={formatString(t('glance.rainAria'), pct)}
      title={t('glance.rainTitle')}
      className="inline-flex items-center gap-x-1.5 text-weather-rain px-1.5 py-1 -mx-1.5 -my-1 rounded hover:bg-weather-rain/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {content}
    </button>
  );
}
