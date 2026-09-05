import { memo } from 'react';
import {
  DailyForecast as DailyForecastType,
  getWeatherIconNode,
  weatherDescriptionKey,
} from '@/lib/weather';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUnits } from '@/contexts/UnitsContext';
import { formatTemperature, formatWindSpeed } from '@/lib/units';
import { SENTINEL_THRESHOLD } from '@/lib/constants';
import { ChevronDown, Droplets, Wind } from 'lucide-react';

/**
 * "Tomorrow at a glance" — a thin, low-weight strip summarising daily[1]
 * (temp range, rain chance when ≥ 20 %, max wind). Sits between the hero
 * section and the hourly/daily split on desktop, and above the swipe deck
 * on mobile so it is glanceable from the first screen. Activating the strip
 * reveals the full DailyForecast (desktop scroll / mobile deck advance).
 *
 * The whole row is one button; its aria-label spells out a full sentence so
 * screen readers never hear a bare "80 %" or "25 km/h" without context.
 */
export const TomorrowGlance = memo(
  ({ forecast, onReveal }: TomorrowGlanceProps) => {
    const { t } = useLanguage();
    const { units } = useUnits();

    // Missing tomorrow row (short/partial forecast) or sentinel temps
    // (no-data placeholder) → nothing to summarise.
    if (
      !forecast ||
      forecast.temperatureMax < SENTINEL_THRESHOLD ||
      forecast.temperatureMin < SENTINEL_THRESHOLD
    ) {
      return null;
    }

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

    const sentence = [
      `${t('daily.tomorrow')}: ${t(weatherDescriptionKey(forecast.weatherCode))}`,
      `${t('daily.high')} ${high}`,
      `${t('daily.low')} ${low}`,
      ...(showPrecip ? [`${t('hourly.rainChance')} ${precipPct}%`] : []),
      `${t('weather.wind')} ${wind} ${windUnit}`,
    ].join(', ');

    // Groups are separated by `·`, each separator living inside its group so
    // hiding a group hides its dot too. Only the wind group hides below
    // 360px (per the spec's narrow-screen note the strip then reads icon +
    // temp only, with the chevron still signalling "more").
    return (
      <button
        type="button"
        onClick={onReveal}
        aria-label={sentence}
        className="flex w-full items-center justify-center gap-x-3 border border-border bg-card px-4 py-2 text-xs tabular-nums text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <span className="kicker">{t('daily.tomorrow')}</span>
        <Icon
          className="h-4 w-4 shrink-0 text-foreground"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <span className="inline-flex items-center gap-x-1.5 text-foreground/90">
          {high}
          <span aria-hidden="true">/</span>
          {low}
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
        <ChevronDown
          className="h-3.5 w-3.5 text-muted-foreground/70"
          aria-hidden="true"
        />
      </button>
    );
  },
);

TomorrowGlance.displayName = 'TomorrowGlance';

interface TomorrowGlanceProps {
  /** Tomorrow's daily row (`daily[1]`). When absent the strip renders nothing. */
  forecast?: DailyForecastType;
  /** Reveals the full daily forecast (scroll-to on desktop, deck advance on mobile). */
  onReveal: () => void;
}
