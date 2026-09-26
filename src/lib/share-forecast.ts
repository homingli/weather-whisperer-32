/**
 * Share-forecast message builder.
 *
 * Turns the daily or hourly forecast into a short, chat-friendly text block
 * a user can paste into a conversation (or hand to the Web Share API) so
 * friends can see the weather leading up to an outdoor event. Pure and
 * framework-free: the caller supplies a `translate` function so this module
 * never imports React or the LanguageContext.
 *
 * Daily message shape:
 *   Weather in Hong Kong for the coming days:
 *
 *   ☀️ Sat, Sep 19 · Sunny · 24–28°C · 60% rain
 *   🌧️ Sun, Sep 20 · Rain · 23–26°C
 *
 *   https://<app-url>
 *
 * Hourly message shape (header carries an "as of" time anchored to the
 * forecast's first hour — hourly forecasts go stale within hours):
 *   Weather in Hong Kong for the coming hours (as of 2:00 PM):
 *
 *   ☀️ 2 PM · Sunny · 28°C · 60% rain
 *   🌧️ 3 PM · Light rain · 26°C
 *
 *   https://<app-url>
 */

import type { DailyForecast, HourlyForecast } from '@/lib/weather';
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

export interface BuildHourlyForecastShareTextOptions {
  /** Display name of the city the forecast is for. */
  cityName: string;
  /** Upcoming hourly forecasts (the card shows the first ~8 hours). */
  hours: HourlyForecast[];
  units: Units;
  language: Language;
  /** IANA timezone of the forecast location; falls back to the device's. */
  timezone?: string;
  /** Translation lookup (pass `t` from `useLanguage()`). */
  translate: (key: string) => string;
  /** Link appended after the forecast (e.g. `window.location.origin`). */
  url?: string;
  /**
   * Fallback anchor used only when `hours` carries no usable first
   * timestamp. The header anchors to the forecast's own first hour — the
   * card labels that hour "Now" — so a stale cache shares with the vintage
   * it actually has instead of claiming the share-click moment.
   */
  now?: Date;
}

/**
 * Hourly twin of `buildForecastShareText`. Hourly forecasts go stale within
 * hours, so the header carries an "as of" timestamp — the first forecast
 * hour, formatted in the forecast location's timezone; on the hourly card
 * that hour is literally labeled "Now", so the message states the data's
 * vintage, not when the user happened to hit share. Each line then reads
 * like the daily share — emoji, clock time, condition, temperature, rain
 * chance — so the two messages feel like the same feature:
 *
 *   Weather in Hong Kong for the coming hours (as of 2:00 PM):
 *
 *   ☀️ 2 PM · Sunny · 28°C · 60% rain
 *   🌧️ 3 PM · Light rain · 26°C
 *
 *   https://<app-url>
 */
export function buildHourlyForecastShareText({
  cityName,
  hours,
  units,
  language,
  timezone,
  translate,
  url,
  now = new Date(),
}: BuildHourlyForecastShareTextOptions): string {
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const degree = temperatureUnitLabel(units);

  // Anchor to the first hour that parses — a malformed leading entry
  // shouldn't cost the header its data-vintage signal. Times arrive as ISO
  // strings from the localStorage snapshot/persister (JSON has no Date
  // type) — same normalization the chart does.
  const anchorTime = hours
    .map((h) => (h.time instanceof Date ? h.time : new Date(h.time)))
    .find((time) => !isNaN(time.getTime()));
  const anchor = anchorTime ?? now;
  const asOf = formatInTimezone(anchor, appLocale(language), {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const lines = hours
    .map((hour) => {
      const emoji = getWeatherIcon(hour.weatherCode, hour.isDay);
      // Times arrive as ISO strings from the localStorage snapshot/persister
      // (JSON has no Date type) — same normalization the chart does.
      const time = hour.time instanceof Date ? hour.time : new Date(hour.time);
      // A malformed persisted timestamp would render "Invalid Date" into
      // the shared text — drop the line instead.
      if (isNaN(time.getTime())) return null;
      const when = formatInTimezone(time, appLocale(language), {
        timeZone: tz,
        hour: 'numeric',
        hour12: true,
      });
      const description = translate(weatherDescriptionKey(hour.weatherCode));
      const temperature = toDisplayTemperature(hour.temperature, units);
      const chance = hour.precipitationProbability;
      const rain = chance > 0 ? fill(translate('share.rainChance'), chance) : '';
      return [`${emoji} ${when} · ${description} · ${temperature}${degree}`, rain]
        .filter(Boolean)
        .join(' · ');
    })
    .filter((line): line is string => line !== null);

  const parts = [fill(translate('share.hourlyHeader'), cityName, asOf), '', ...lines];
  if (url) parts.push('', url);
  return parts.join('\n');
}
