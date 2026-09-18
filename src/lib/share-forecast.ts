/**
 * Share-forecast message builder.
 *
 * Turns the daily forecast into a short, chat-friendly text block a user can
 * paste into a conversation (or hand to the Web Share API) so friends can see
 * the weather for the days leading up to an outdoor event. Pure and
 * framework-free: the caller supplies a `translate` function so this module
 * never imports React or the LanguageContext.
 *
 * Message shape:
 *   Weather in Hong Kong for the coming days:
 *
 *   ☀️ Sat, Sep 19 · Sunny · 24–28°C · 60% rain
 *   🌧️ Sun, Sep 20 · Rain · 23–26°C
 *
 *   https://<app-url>
 */

import type { DailyForecast } from '@/lib/weather';
import { getWeatherIcon, weatherDescriptionKey } from '@/lib/weather';
import { formatInTimezone, appLocale } from '@/lib/utils';
import { toDisplayTemperature, temperatureUnitLabel, type Units } from '@/lib/units';
import { psrToPercentage } from '@/lib/hko-psr';
import type { Language } from '@/contexts/LanguageContext';

/** Fill the `{0}`-style placeholders used across the app's translation strings. */
function fill(template: string, ...args: (string | number)[]): string {
  return template.replace(/{(\d+)}/g, (match, index) =>
    typeof args[Number(index)] !== 'undefined' ? String(args[Number(index)]) : match
  );
}

/** Rain-chance percentage for a day, or 0 when the sources agree it's dry. */
function rainChance(day: DailyForecast): number {
  if (day.precipitationProbabilityRaw) return psrToPercentage(day.precipitationProbabilityRaw);
  return day.precipitationProbabilityMax;
}

export interface BuildForecastShareTextOptions {
  /** Display name of the city the forecast is for. */
  cityName: string;
  /** Upcoming daily forecasts (already capped by the data source, ~7 days). */
  days: DailyForecast[];
  units: Units;
  language: Language;
  /** IANA timezone of the forecast location; falls back to the device's. */
  timezone?: string;
  /** Translation lookup (pass `t` from `useLanguage()`). */
  translate: (key: string) => string;
  /** Link appended after the forecast (e.g. `window.location.origin`). */
  url?: string;
}

export function buildForecastShareText({
  cityName,
  days,
  units,
  language,
  timezone,
  translate,
  url,
}: BuildForecastShareTextOptions): string {
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const degree = temperatureUnitLabel(units);

  const lines = days.map((day) => {
    const emoji = getWeatherIcon(day.weatherCode, true);
    // Dates arrive as ISO strings from the localStorage snapshot/persister
    // (JSON has no Date type) — same normalization DailyForecast does.
    const date = day.date instanceof Date ? day.date : new Date(day.date);
    const when = formatInTimezone(date, appLocale(language), {
      timeZone: tz,
      weekday: 'short',
      month: 'numeric',
      day: 'numeric',
    });
    const description = translate(weatherDescriptionKey(day.weatherCode));
    const low = toDisplayTemperature(day.temperatureMin, units);
    const high = toDisplayTemperature(day.temperatureMax, units);
    const chance = rainChance(day);
    const rain = chance > 0 ? fill(translate('share.rainChance'), chance) : '';
    return [`${emoji} ${when} · ${description} · ${low}–${high}${degree}`, rain]
      .filter(Boolean)
      .join(' · ');
  });

  const parts = [fill(translate('share.header'), cityName), '', ...lines];
  if (url) parts.push('', url);
  return parts.join('\n');
}
