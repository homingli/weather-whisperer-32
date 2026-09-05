import { memo, useEffect, useMemo, useRef, useState } from "react";
import { CurrentWeather as CurrentWeatherType, HourlyForecast, DailyForecast, getWeatherIconNode, weatherDescriptionKey, getHKOIconNode, hkoDescriptionKey } from "@/lib/weather";
import type { HeadlineInfo } from "@/lib/weather";
import type { LucideIcon } from "lucide-react";
import { SENTINEL_THRESHOLD, QUIET } from "@/lib/constants";
import { Umbrella, UmbrellaOff, Sunrise, Sunset, Droplets, Sun, Wind, Droplet, AlertTriangle, Moon } from "lucide-react";
import { useLanguage, formatString } from "@/contexts/LanguageContext";
import { useUnits } from "@/contexts/UnitsContext";
import type { Units } from "@/lib/units";
import {
  toDisplayTemperature,
  formatTemperature,
  formatWindSpeed,
  formatPrecipitation,
  mmToInches,
  formatHeroTemperature,
  precipitationUnitLabel,
} from "@/lib/units";
import { formatInTimezone, appLocale } from "@/lib/utils";

/** Convert a wind bearing (0-360°, 0 = N) to a compass abbreviation. */
function windCompass(deg: number): string {
  if (deg == null || isNaN(deg)) return "—";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  // Normalize to [0, 360) so 360° maps back to N (index 0), then bucket by 45°
  // and clamp the max index to 7 so 359° lands on NW instead of wrapping to N.
  const normalized = ((deg % 360) + 360) % 360;
  return dirs[Math.min(Math.round(normalized / 45), 7)];
}

interface CurrentWeatherProps {
  weather: CurrentWeatherType;
  hourlyForecast: HourlyForecast[];
  dailyForecast?: DailyForecast;
  locationName?: string;
  timezone?: string;
  /**
   * Headline source discriminator. The `weather-manager` decides whether
   * the headline icon + label come from HKO's icon taxonomy (HK + both
   * sources live) or from the WMO 4677 lookup on `weather.weatherCode`
   * (everywhere else + degraded cases). The field is always present on
   * the parent `WeatherData`; non-HK and partial paths pass
   * `{ source: 'om' }`.
   *
   * Optional in the prop signature for defensive rendering: the cold-start
   * `localStorage` seed can hold a snapshot from a previous app version
   * that didn't carry this field. `weather-manager` always writes it on a
   * live fetch, and the snapshot schema is bumped to v2 so old snapshots
   * are dropped on read; this optional + OM-default is a belt-and-braces
   * guard against future shape drift at this type boundary.
   */
  headline?: HeadlineInfo;
  /** Mobile-only swiper layout: tighter padding, centered hero with
   *  icon and apparent-temp side-by-side. */
  compact?: boolean;
  /** Tomorrow's sunrise (daily[1]). Used as the night-span end on the
   *  sun-cycle strip once today's sunset has passed — without it the strip
   *  approximates with today's sunrise + 24h. */
  tomorrowSunrise?: Date | string | number;
}

/**
 * Resolve the headline icon + label key from the discriminator. The HKO
 * path uses the icon's day/night built into the code (50 ↔ 70, etc.), so
 * callers don't pass `isDay` for HKO; the WMO path falls through to the
 * existing `getWeatherIconNode(code, isDay)` lookup that already handles
 * day/night variants.
 */
function headlineIconAndLabel(
  headline: HeadlineInfo,
  weather: CurrentWeatherType,
): { Icon: LucideIcon; labelKey: string } {
  if (headline.source === 'hko' && headline.hkoIconCode != null) {
    return {
      Icon: getHKOIconNode(headline.hkoIconCode),
      labelKey: hkoDescriptionKey(headline.hkoIconCode),
    };
  }
  return {
    Icon: getWeatherIconNode(weather.weatherCode, weather.isDay),
    labelKey: weatherDescriptionKey(weather.weatherCode),
  };
}

/** Module-scope so the useMemo sees a stable reference. */
const HEADLINE_DEFAULT_OM: HeadlineInfo = { source: 'om' };

/* ── UV index banding (WHO-aligned colors and exposure levels) ─────── */
type UvBand = { max: number; bg: string; text: string; border: string; labelKey: string };

const UV_BANDS: UvBand[] = [
  { max: 2,    bg: "#16a34a", text: "#ffffff", border: "#15803d", labelKey: "uv.low" },
  { max: 5,    bg: "#facc15", text: "#1a1a1a", border: "#ca8a04", labelKey: "uv.moderate" },
  { max: 7,    bg: "#f97316", text: "#ffffff", border: "#c2410c", labelKey: "uv.high" },
  { max: 10,   bg: "#dc2626", text: "#ffffff", border: "#991b1b", labelKey: "uv.veryHigh" },
  { max: 1000, bg: "#7c3aed", text: "#ffffff", border: "#5b21b6", labelKey: "uv.extreme" },
];

function uvBandFor(uv: number | null): UvBand {
  if (uv == null) return { max: 0, bg: "transparent", text: "currentColor", border: "currentColor", labelKey: "uv.unavailable" };
  for (const b of UV_BANDS) if (uv <= b.max) return b;
  return UV_BANDS[UV_BANDS.length - 1];
}

/* ── Rainfall bands, mirrors the nowcast map legend ───────────────── */
type RainBand = { max: number; color: string; label: string };

const RAINFALL_BANDS: RainBand[] = [
  { max: 2,         color: "#a0c4ff", label: "0.5 – 2 mm" },
  { max: 5,         color: "#4facfe", label: "2 – 5 mm" },
  { max: 10,        color: "#00f2fe", label: "5 – 10 mm" },
  { max: 20,        color: "#43e97b", label: "10 – 20 mm" },
  { max: 30,        color: "#f6d365", label: "20 – 30 mm" },
  { max: Infinity,  color: "#9d0b0b", label: "> 30 mm" },
];

// US-mode variant — same colors as the metric bands (HKO-defined) but labels
// show inch thresholds so the band the marker lights up reads in the active
// unit system. Thresholds are the inch-equivalent of the metric ones.
const RAINFALL_BANDS_US: RainBand[] = [
  { max: 0.08,      color: "#a0c4ff", label: "0.02 – 0.08 in" },
  { max: 0.2,       color: "#4facfe", label: "0.08 – 0.2 in" },
  { max: 0.4,       color: "#00f2fe", label: "0.2 – 0.4 in" },
  { max: 0.8,       color: "#43e97b", label: "0.4 – 0.8 in" },
  { max: 1.2,       color: "#f6d365", label: "0.8 – 1.2 in" },
  { max: Infinity,  color: "#9d0b0b", label: "> 1.2 in" },
];

function rainfallBandIndexFor(mm: number, units: Units): number {
  if (!isFinite(mm) || mm < 0) return -1;
  // Look up against the active bands array. In US mode, compare against inch
  // thresholds (after converting mm to inches); otherwise compare against
  // metric thresholds directly. Mixing the two arrays by index without
  // conversion mis-lights bands (e.g. 5 mm → 0.197 in → "0.08–0.2 in",
  // NOT band index 2 of the inch array which would be "0.2–0.4 in").
  const bands = units === 'us' ? RAINFALL_BANDS_US : RAINFALL_BANDS;
  const value = units === 'us' ? mmToInches(mm) : mm;
  // "Below the lowest band" — 0.5 mm / 0.02 in. Match exactly to preserve
  // the HKO-source "trace" cutoff.
  const traceCutoff = units === 'us' ? 0.02 : 0.5;
  if (value < traceCutoff) return -1;
  for (let i = 0; i < bands.length; i++) {
    if (value <= bands[i].max) return i;
  }
  return bands.length - 1;
}

export const CurrentWeather = memo(({ weather, hourlyForecast, dailyForecast, timezone, compact = false, headline, tomorrowSunrise }: CurrentWeatherProps) => {
  const { t } = useLanguage();
  const { units } = useUnits();
  const root = useRef<HTMLDivElement>(null);

  const isEmpty = weather.apparentTemperature < SENTINEL_THRESHOLD;

  const needsUmbrella = useMemo(() => {
    const isCurrentlyRaining = (weather.precipitation ?? 0) > 2;
    const next6Hours = hourlyForecast.slice(0, 6);
    const firstRainyHour = next6Hours.find(hour => hour.precipitationProbability >= 25);
    return isCurrentlyRaining || !!firstRainyHour;
  }, [weather, hourlyForecast]);

  const uvBand = useMemo(() => uvBandFor(weather.uvIndex), [weather.uvIndex]);
  const humidityPct = isEmpty ? 0 : Math.max(0, Math.min(100, weather.humidity));
  const windDeg = isEmpty ? 0 : weather.windDirection;

  /* Quiet shelf — metrics below their attention thresholds (QUIET in
     lib/constants) stay visible as compact, expanded rows. Empty data is a
     separate state (legacy grid with dashes). */
  const quietItems = useMemo<QuietItem[]>(() => {
    if (isEmpty) return [];
    const mm = weather.precipitation ?? 0;
    const windUnit = units === 'us' ? t('unit.mph', 'mph') : t('unit.kmh', 'km/h');
    const items: QuietItem[] = [];
    if (mm < QUIET.PRECIP_MM) {
      items.push({ id: 'precip', Icon: Droplets, label: t('daily.precip'), value: `${formatPrecipitation(mm, units)} ${precipitationUnitLabel(units)}` });
    }
    if (weather.uvIndex == null || weather.uvIndex < QUIET.UV_MAX) {
      items.push({ id: 'uv', Icon: Sun, label: t('weather.uvIndex'), value: weather.uvIndex == null ? '—' : weather.uvIndex.toFixed(1) });
    }
    if (humidityPct >= QUIET.HUMIDITY_MIN && humidityPct <= QUIET.HUMIDITY_MAX) {
      items.push({ id: 'humidity', Icon: Droplet, label: t('weather.humidity'), value: `${Math.round(humidityPct)}%` });
    }
    if (weather.windSpeed < QUIET.WIND_KMH) {
      items.push({ id: 'wind', Icon: Wind, label: t('weather.wind'), value: `${formatWindSpeed(weather.windSpeed, units)} ${windUnit}` });
    }
    return items;
  }, [isEmpty, weather, humidityPct, units, t]);
  const quietKeys = useMemo(() => new Set(quietItems.map((i) => i.id)), [quietItems]);

  const resolvedHeadline: HeadlineInfo = headline ?? HEADLINE_DEFAULT_OM;
  const headlineRender = useMemo(
    () => headlineIconAndLabel(resolvedHeadline, weather),
    [resolvedHeadline, weather],
  );

  return (
    <div
      ref={root}
      className={`editorial-card ${compact ? 'overflow-x-hidden overflow-y-auto p-6 overscroll-contain' : 'overflow-hidden p-6 md:p-8 lg:p-10'}`}
    >
      {/* Sun-cycle progress strip — the active phase bar with time left
          until it ends. Sits above the hero so users see the daylight context
          before the temperature and conditions. */}
      <SunCycleProgress
        sunrise={dailyForecast?.sunrise}
        sunset={dailyForecast?.sunset}
        nextSunrise={tomorrowSunrise}
        timezone={timezone}
        needsUmbrella={needsUmbrella}
      />

      <div>
        {/* Feels-like kicker above the hero so the big number is read as apparent temperature. */}
          <p className={`cw-fade kicker text-muted-foreground mb-2 text-center`}>
            {t('weather.feelsLike')}
          </p>

          {/* Hero — compact mode: icon + apparent-temp side-by-side, centered (mobile swiper).
              Desktop mode: 2-col with temp on the left, icon + conditions on the right. */}
          {compact ? (
            <div className="flex flex-col gap-6">
          <div className="flex items-center justify-center gap-6">
            {(() => {
              const Icon = headlineRender.Icon;
              return (
                <span
                  className="inline-flex items-center justify-center text-[72px] sm:text-[110px] leading-none select-none text-foreground"
                  role="img"
                  aria-label={t(headlineRender.labelKey)}
                >
                  {/* Icon height tracks the h1 floor (72px on narrow viewports
                      so it doesn't dwarf the numeral; 110px on sm+ to match the
                      hero scale). */}
                  <Icon className="h-[72px] w-[72px] sm:h-[110px] sm:w-[110px]" strokeWidth={1.25} />
                </span>
              );
            })()}
            <div className="overflow-hidden min-w-0">
              {/* Clamp(72px, 22vw, 140px) — the previous uncapped `text-[22vw]`
                  scaled to ~169px on a 768px tablet and clipped the right edge
                  of the card. 140px is the largest size that still fits the
                  icon + numerals side-by-side in the available card width. */}
              <h1 className="cw-rise block font-display text-[clamp(72px,22vw,140px)] leading-[0.85] font-light tracking-[-0.04em]">
                {formatHeroTemperature(weather.apparentTemperature, units, SENTINEL_THRESHOLD)}
              </h1>
            </div>
          </div>
          <p className="cw-fade text-center font-display italic text-xl text-muted-foreground">
            {t(headlineRender.labelKey)}
          </p>
            </div>
          ) : (
            <header className="grid gap-6 md:grid-cols-[auto_auto] md:items-center md:justify-center md:text-center">
          <div className="overflow-hidden min-w-0">
            <h1 className="cw-rise block font-display text-[clamp(80px,14vw,160px)] leading-[0.85] font-light tracking-[-0.04em]">
              {formatHeroTemperature(weather.apparentTemperature, units, SENTINEL_THRESHOLD)}
            </h1>
          </div>
          <div className="cw-fade flex flex-col gap-3 max-w-xs">
            <span
              className="inline-flex items-center justify-center text-foreground leading-none select-none"
              role="img"
              aria-label={t(headlineRender.labelKey)}
            >
              {(() => {
                const Icon = headlineRender.Icon;
                return <Icon className="h-16 w-16 md:h-20 md:w-20" strokeWidth={1.25} />;
              })()}
            </span>
            <p className="font-display text-2xl md:text-3xl italic font-light leading-tight">
              {t(headlineRender.labelKey)}
            </p>
          </div>
            </header>
          )}
      </div>

      {/* Temperature caption — today's high/low plus the short-term trend
          ("3° warmer by 03:00 PM"). One muted line under the hero; the old
          full-width range bar was dropped because a position marker on a
          linear low→high axis can't tell pre-peak from post-peak — the
          hourly chart owns that job. Sits above the hairline rule that
          separates the hero from the stat widgets. */}
      <div className="cw-fade mt-4 md:mt-5">
        <TempSummary
          low={dailyForecast?.temperatureMin}
          high={dailyForecast?.temperatureMax}
          current={weather.temperature}
          hourly={hourlyForecast}
          timezone={timezone}
          empty={isEmpty}
        />
      </div>

      <div className="cw-rule h-px editorial-rule my-6" />

      {/* Bottom section — full widgets for metrics that need attention.
          Quiet metrics (below QUIET thresholds) stay in the
          expanded shelf below: data present, nothing to act on. Empty
          data keeps the legacy 4-widget grid with dashes. */}
      {isEmpty ? (
        <div className={`grid gap-x-10 gap-y-6 cw-fade ${compact ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
          <PrecipBar mm={weather.precipitation ?? 0} empty={isEmpty} units={units} />
          <UvChip uv={weather.uvIndex} band={uvBand} label={t('weather.uvIndex')} empty={isEmpty} />
          <HumidityBar pct={humidityPct} label={t('weather.humidity')} empty={isEmpty} />
          <WindCompass
            deg={windDeg}
            speed={weather.windSpeed}
            label={t('weather.wind')}
            empty={isEmpty}
            unitLabel={units === 'us' ? t('unit.mph', 'mph') : t('unit.kmh', 'km/h')}
            units={units}
          />
        </div>
      ) : (
        <>
          {quietItems.length < 4 && (
            <div className={`grid gap-x-10 gap-y-6 cw-fade ${compact ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
              {!quietKeys.has('precip') && <PrecipBar mm={weather.precipitation ?? 0} empty={false} units={units} />}
              {!quietKeys.has('uv') && <UvChip uv={weather.uvIndex} band={uvBand} label={t('weather.uvIndex')} empty={false} />}
              {!quietKeys.has('humidity') && <HumidityBar pct={humidityPct} label={t('weather.humidity')} empty={false} />}
              {!quietKeys.has('wind') && (
                <WindCompass
                  deg={windDeg}
                  speed={weather.windSpeed}
                  label={t('weather.wind')}
                  empty={false}
                  unitLabel={units === 'us' ? t('unit.mph', 'mph') : t('unit.kmh', 'km/h')}
                  units={units}
                />
              )}
            </div>
          )}
          {quietItems.length > 0 && (
            <div className="mt-6">
              <div className="cw-rule h-px editorial-rule mb-4" />
              <QuietShelf items={quietItems} groupLabel={t('quiet.shelfLabel')} />
            </div>
          )}
        </>
      )}
    </div>
  );
});

CurrentWeather.displayName = 'CurrentWeather';

/* ── Temperature caption: today's high/low + short-term trend ──────── */

/** Visible glyph when the 3h trend rounds to zero. Kept aria-hidden so
 *  assistive tech never announces a bare dash; an sr-only "no change" copy
 *  carries the meaning in the content, and the group's aria-label spells
 *  out the full sentence (a "0°" claim would read as noise). */
const STEADY_TREND_GLYPH = '–';

/** Normalize an hourly entry's time at the persistence boundary: the live
 *  parser hands out Date instances, but query-cache hydration from
 *  localStorage returns the same field as an ISO string. TS types it as
 *  Date, so the runtime check is what keeps .getTime() safe. */
function toTimeMs(time: Date): number {
  return time instanceof Date ? time.getTime() : new Date(time).getTime();
}

/** Temperature change (whole display degrees) from the current hour to
 *  the entry ~3 hours later. Clamps the target to the last available entry
 *  near the end of the nowcast horizon. Returns null when there is no
 *  future hour to compare against — including when the target hour has
 *  already passed, which happens when Index feeds a stale persisted
 *  snapshot (offline/cache): "3° warmer by 11:00 AM" would be a lie at
 *  11:05. Rounds each endpoint in the active unit system (convert before
 *  rounding) so the delta matches what the thermometer reads. */
function hourlyTrendDelta(hourly: HourlyForecast[], units: Units, now = Date.now()): number | null {
  if (hourly.length < 2) return null;
  const target = hourly[Math.min(3, hourly.length - 1)];
  const targetMs = toTimeMs(target.time);
  if (!Number.isFinite(targetMs) || targetMs <= now) return null;
  return toDisplayTemperature(target.temperature, units)
    - toDisplayTemperature(hourly[0].temperature, units);
}

/** Muted one-liner under the hero: "H 32°C / L 24°C · 3° warmer by
 *  03:00 PM". The high/low keep the day's envelope glanceable; the trend
 *  clause answers "hotter or cooler from here?" without the misleading
 *  position marker the old range bar used. Hidden on empty data. */
function TempSummary({
  low, high, current, hourly, timezone, empty,
}: {
  low?: number; high?: number; current: number; hourly: HourlyForecast[];
  timezone?: string; empty: boolean;
}) {
  const { language, t } = useLanguage();
  const { units } = useUnits();
  if (empty) return null;

  const lo = low ?? current;
  const hi = high ?? current;
  const loStr = formatTemperature(lo, units);
  const hiStr = formatTemperature(hi, units);

  const delta = hourlyTrendDelta(hourly, units);
  let trendText = '';
  let trendAria = '';
  if (delta != null) {
    // Rebuild a real Date from the (possibly string, post-hydration) time:
    // Intl.DateTimeFormat.format throws on strings, so pass a Date.
    const targetDate = new Date(toTimeMs(hourly[Math.min(3, hourly.length - 1)].time));
    const hour12 = language !== 'tc';
    const targetLabel = formatInTimezone(targetDate, appLocale(language), {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12,
    });
    if (delta === 0) {
      trendText = STEADY_TREND_GLYPH;
      trendAria = t('trend.steady');
    } else if (delta > 0) {
      trendText = formatString(t('trend.warmer'), String(delta), targetLabel);
      trendAria = trendText;
    } else {
      trendText = formatString(t('trend.cooler'), String(-delta), targetLabel);
      trendAria = trendText;
    }
  }

  const ariaLabel = `${t('temp.hi')} ${hiStr}, ${t('temp.lo')} ${loStr}`
    + (trendAria ? `, ${trendAria}` : '');
  return (
    <div
      data-testid="temp-summary"
      role="group"
      aria-label={ariaLabel}
      className="flex flex-wrap items-center justify-center gap-x-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 tabular-nums"
    >
      <span>{t('temp.hi')} {hiStr}</span>
      <span aria-hidden="true">·</span>
      <span>{t('temp.lo')} {loStr}</span>
      {trendText && (
        <>
          <span aria-hidden="true">·</span>
          <span data-testid="temp-trend">
            {delta === 0 ? (
              <>
                <span aria-hidden="true">{STEADY_TREND_GLYPH}</span>
                <span className="sr-only">{t('trend.steady')}</span>
              </>
            ) : (
              trendText
            )}
          </span>
        </>
      )}
    </div>
  );
}

/* ── Sun-time helpers shared by the sun-cycle strip ────────────────── */

/** HKO-only fallback seeds sun times with epoch-0 sentinels; anything at or
 *  before the epoch is no-data, not an event. JSON-persisted weather data
 *  carries these values as ISO strings, so normalize at this boundary. */
function toValidSunDate(value: Date | string | number | undefined | null): Date | undefined {
  const date = value instanceof Date ? value : value == null ? undefined : new Date(value);
  return date && Number.isFinite(date.getTime()) && date.getTime() > 0 ? date : undefined;
}

/** Format a whole-minute lead time the way the sun strip shows it:
 *  "in 3h 12m" / "in 3h" / "in 12m", or "now" under a minute. */
function formatSunCountdown(diffMin: number, t: (key: string, fallback?: string) => string): string {
  const hrs = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  if (diffMin < 1) return t('sun.now');
  if (hrs > 0 && mins > 0) return formatString(t('sun.inHoursMinutes'), String(hrs), String(mins));
  if (hrs > 0) return formatString(t('sun.inHours'), String(hrs));
  return formatString(t('sun.inMinutes'), String(mins));
}

/* ── Sun-cycle progress strip: daylight / night bar with time left ── */

type SunCycle = {
  kind: 'day' | 'night';
  /** Phase start: sunrise (day) or sunset (night). */
  start: Date;
  /** Phase end: sunset (day) or the next sunrise (night). */
  end: Date;
};

/**
 * Resolve the sun phase that contains `now` from the minute-exact daily
 * timestamps — never the API's 15-minute `is_day` grid.
 *
 * - Day: [sunrise, sunset) — progress = daylight elapsed.
 * - Evening night: [sunset, next sunrise). `nextSunrise` (tomorrow's,
 *   daily[1]) is preferred; without it today's sunrise + 24h stays
 *   approximately right (sunrise drifts ~1 min/day).
 * - Pre-dawn night: the current night began at YESTERDAY's sunset, which is
 *   not in the forecast; today's sunset − 24h is a close approximation
 *   (sunset also drifts ~1 min/day).
 *
 * Returns null when either boundary is missing or the span is inverted
 * (polar day/night edge cases: sunrise ≥ sunset) — callers hide the strip.
 */
function sunCycleFor(
  now: number,
  sunrise: Date,
  sunset: Date,
  nextSunrise: Date | undefined,
): SunCycle | null {
  const sr = sunrise.getTime();
  const ss = sunset.getTime();
  if (ss <= sr) return null; // No real daylight span — polar edge case.

  if (now < sr) {
    const start = new Date(ss - 24 * 3600_000); // ≈ yesterday's sunset
    if (start.getTime() >= sr) return null;
    return { kind: 'night', start, end: sunrise };
  }
  if (now < ss) {
    return { kind: 'day', start: sunrise, end: sunset };
  }
  const next = nextSunrise && nextSunrise.getTime() > ss
    ? nextSunrise
    : new Date(sr + 24 * 3600_000);
  if (next.getTime() <= ss) return null;
  return { kind: 'night', start: sunset, end: next };
}

/* Whole-bar gradients trace the sun's course so each bar reads left → right:
   the day bar goes warm daylight yellow (sunrise) through afternoon gold and
   orange into a light dusk blue (sunset); the night bar reverses it from
   dusk blue back through deep blue to a pale dawn gold (next sunrise). */
const DAY_GRADIENT = 'linear-gradient(90deg, #fde047 0%, #fbbf24 35%, #fb923c 65%, #60a5fa 100%)';
const NIGHT_GRADIENT = 'linear-gradient(90deg, #60a5fa 0%, #3b82f6 55%, #f59e0b 88%, #fde047 100%)';

function SunCycleProgress({
  sunrise, sunset, nextSunrise, timezone, needsUmbrella,
}: {
  sunrise?: Date | string | number;
  sunset?: Date | string | number;
  nextSunrise?: Date | string | number;
  timezone?: string;
  needsUmbrella?: boolean;
}) {
  const { language, t } = useLanguage();
  const [now, setNow] = useState(() => Date.now());

  // Re-tick every minute so the marker stays current — the strip must flip
  // from day to night exactly at sunrise/sunset even between data refreshes.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Rebase immediately when new location data arrives.
  useEffect(() => {
    setNow(Date.now());
  }, [sunrise, sunset, nextSunrise, timezone]);

  const sunriseDate = toValidSunDate(sunrise);
  const sunsetDate = toValidSunDate(sunset);
  const nextSunriseDate = toValidSunDate(nextSunrise);
  const cycle = useMemo(() => {
    if (!sunriseDate || !sunsetDate) return null;
    return sunCycleFor(now, sunriseDate, sunsetDate, nextSunriseDate);
  }, [now, sunriseDate, sunsetDate, nextSunriseDate]);

  if (!cycle) return null;

  const isDay = cycle.kind === 'day';
  const spanMs = cycle.end.getTime() - cycle.start.getTime();
  const pct = Math.min(1, Math.max(0, (now - cycle.start.getTime()) / spanMs));
  const locale = appLocale(language);
  const hour12 = language !== 'tc';
  const timeOptions: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12,
  };
  const startTime = formatInTimezone(cycle.start, locale, timeOptions);
  const endTime = formatInTimezone(cycle.end, locale, timeOptions);
  // Time left until the phase ends (sunset by day, sunrise by night).
  const diffMin = Math.max(0, Math.floor((cycle.end.getTime() - now) / 60_000));
  const leftText = formatSunCountdown(diffMin, t);

  // Day reads left→right sunrise → sunset; night reads sunset → next sunrise.
  const PhaseIcon = isDay ? Sun : Moon;
  const StartIcon = isDay ? Sunrise : Sunset;
  const EndIcon = isDay ? Sunset : Sunrise;
  const phaseLabel = t(isDay ? 'sun.daylight' : 'sun.night');
  const startLabel = t(isDay ? 'daily.sunrise' : 'daily.sunset');
  const endLabel = t(isDay ? 'daily.sunset' : 'daily.sunrise');

  return (
    <div
      data-testid="sun-progress"
      data-phase={cycle.kind}
      role="group"
      className="cw-fade flex flex-col gap-3"
      aria-label={`${phaseLabel}: ${leftText}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="kicker text-muted-foreground inline-flex items-center gap-2">
          <PhaseIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {phaseLabel}
        </span>
        <span className="font-display text-2xl md:text-3xl font-light tabular-nums leading-none">
          {leftText}
        </span>
      </div>
      <div
        className="relative h-2 border border-foreground/15"
        style={{ background: isDay ? DAY_GRADIENT : NIGHT_GRADIENT }}
        aria-hidden="true"
      >
        {/* Marker at the current time — umbrella icon on the daylight span. */}
        <span
          className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-foreground"
          style={{ left: `${pct * 100}%` }}
          aria-hidden
        >
          {needsUmbrella ? (
            <Umbrella className="h-6 w-6 border border-foreground bg-background p-0.5" strokeWidth={1.75} />
          ) : (
            <UmbrellaOff className="h-6 w-6 border border-foreground bg-background p-0.5" strokeWidth={1.75} />
          )}
        </span>
      </div>
      <div className="flex justify-between gap-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 tabular-nums">
        {/* Icons + bar colour already identify the day/night phase; the
            "Sunrise"/"Sunset" words are visual noise, so they stay
            screen-reader-only (sr-only) and never render on screen. */}
        <span className="inline-flex items-center gap-1.5">
          <StartIcon className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="whitespace-nowrap">
            <span className="sr-only">{startLabel} </span>{startTime}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <EndIcon className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="whitespace-nowrap">
            <span className="sr-only">{endLabel} </span>{endTime}
          </span>
        </span>
      </div>
    </div>
  );
}

/* ── Humidity: thin gradient bar matching the other sections ──────── */
function HumidityBar({ pct, label, empty }: { pct: number; label: string; empty: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="kicker text-muted-foreground inline-flex items-center gap-2">
          <Droplet className="h-3.5 w-3.5" />
          {label}
        </span>
        <span className="font-display text-2xl md:text-3xl font-light tabular-nums leading-none">
          {empty ? '—' : `${Math.round(pct)}%`}
        </span>
      </div>
      <div className="relative h-2 overflow-hidden border border-foreground/15">
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-700 ease-out"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg, #bae6fd 0%, #38bdf8 60%, #0284c7 100%)",
          }}
          aria-hidden
        />
      </div>
      <div className="flex justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50 tabular-nums">
        <span>0%</span><span>100%</span>
      </div>
    </div>
  );
}

/* ── Wind: single-row kicker | arrow + degrees + speed ──────────────
 * Convention: the arrow points where the wind is blowing TOWARD, not
 * where it's coming from. The API gives the meteorological "from"
 * angle (0° = wind from north); we flip 180° to get the "toward"
 * bearing. Compass label uses the same toward-bearing so the arrow,
 * label, and degree number all agree on direction.
 */
function WindCompass({
  deg, speed, label, empty, unitLabel, units,
}: { deg: number; speed: number; label: string; empty: boolean; unitLabel: string; units: Units }) {
  const { t } = useLanguage();
  const towardDeg = ((deg ?? 0) + 180) % 360;
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <span className="kicker text-muted-foreground inline-flex items-center gap-2">
        <Wind className="h-3.5 w-3.5" />
        {label}
      </span>
      <div className="flex items-center gap-3">
        <span className="font-display text-2xl md:text-3xl font-light tabular-nums leading-none">
          {empty ? '—' : formatWindSpeed(speed, units)}
          <span className="text-xs ml-1 text-muted-foreground/70 not-italic" style={{ fontFamily: "'Outfit', sans-serif" }}>
            {unitLabel}
          </span>
        </span>
        <div
          className="transition-transform duration-500"
          style={{ transform: `rotate(${towardDeg}deg)` }}
          aria-label={empty ? undefined : formatString(t('weather.windDirAria'), String(Math.round(towardDeg)), windCompass(towardDeg))}
        >
          <svg width="22" height="22" viewBox="0 0 48 48" role="img">
            <line x1="24" y1="40" x2="24" y2="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            <polygon points="24,2 16,16 32,16" fill="currentColor" />
          </svg>
        </div>
        <span className="font-display text-xl md:text-2xl tabular-nums leading-none">
          {empty ? '—' : `${Math.round(towardDeg)}°`}
          <span className="ml-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 not-italic" style={{ fontFamily: "'Outfit', sans-serif" }}>
            {empty ? '' : windCompass(towardDeg)}
          </span>
        </span>
      </div>
    </div>
  );
}

/* ── UV index: color-coded chip with exposure level ────────────────── */
function UvChip({
  uv, band, label, empty,
}: { uv: number | null; band: UvBand; label: string; empty: boolean }) {
  const { t } = useLanguage();
  // -1 when uv is null (band is the null sentinel); otherwise the index
  // of the active band inside UV_BANDS. Drives the icon overlay position.
  const activeIdx = UV_BANDS.indexOf(band);
  const showIcon = !empty && uv != null && activeIdx >= 0;
  return (
    <div
      className="flex flex-col gap-3"
      aria-label={
        empty || uv == null
          ? `${label}: ${t('uv.unavailable')}`
          : `${label}: ${uv.toFixed(1)}, ${t(band.labelKey)}`
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="kicker text-muted-foreground inline-flex items-center gap-2">
          <Sun className="h-3.5 w-3.5" />
          {label}
        </span>
        <span className="font-display text-2xl md:text-3xl font-light tabular-nums leading-none">
          {empty || uv == null ? '—' : uv.toFixed(1)}
          {!empty && uv != null && (
            <span
              className="text-xs ml-2 uppercase tracking-[0.18em] not-italic font-normal"
              style={{ fontFamily: "'Outfit', sans-serif", color: band.bg }}
            >
              {t(band.labelKey)}
            </span>
          )}
        </span>
      </div>
      <div className="relative flex h-2 overflow-hidden border border-foreground/15" aria-hidden="true">
        {UV_BANDS.slice(0, 5).map((b, i) => {
          const priorMax = i > 0 ? UV_BANDS[i - 1].max : 0;
          const segActive = !empty && uv != null && uv > priorMax && uv <= b.max;
          return (
            <div
              key={b.labelKey}
              className="flex-1 transition-opacity duration-300"
              style={{
                backgroundColor: b.bg,
                opacity: segActive ? 1 : 0.18,
              }}
            />
          );
        })}
        {showIcon && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: `${((activeIdx + 0.5) / 5) * 100}%`,
              top: '-14px',
              transform: 'translateX(-50%)',
              color: band.text,
            }}
          >
            <AlertTriangle className="h-3 w-3" />
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Precipitation: rainfall nowcast color bar with mm marker ──────── */
function PrecipBar({
  mm, empty, units,
}: { mm: number; empty: boolean; units: Units }) {
  const { t } = useLanguage();
  // US mode uses inch labels/positions and an inch-equivalent max tick.
  const bands = units === 'us' ? RAINFALL_BANDS_US : RAINFALL_BANDS;
  const maxTick = units === 'us' ? 1.2 : 30;
  const displayValue = units === 'us' ? mmToInches(mm) : mm;
  const displayClamped = Math.max(0, Math.min(displayValue, maxTick));
  const posPct = (displayClamped / maxTick) * 100;
  // Compute the band index against the active bands array — never share
  // indices between metric and US arrays, their thresholds differ.
  const bandIndex = rainfallBandIndexFor(mm, units);
  // bandIndex === -1 means "no band lit" (precipitation below the first
  // band's threshold). All segments render at the dim opacity in that case.
  const activeBand = bandIndex >= 0 ? bands[bandIndex] : undefined;
  const unitLabel = precipitationUnitLabel(units);
  const belowLabel = units === 'us' ? 'below 0.02 in' : 'below 0.5 mm';

  return (
    <div
      className="flex flex-col gap-3"
      aria-label={
        empty
          ? `${t('daily.precip')}: unavailable`
          : `${t('daily.precip')}: ${formatPrecipitation(mm, units)} ${unitLabel}${activeBand ? `, ${activeBand.label}` : `, ${belowLabel}`}`
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="kicker text-muted-foreground inline-flex items-center gap-2">
          <Droplets className="h-3.5 w-3.5" />
          {t('daily.precip')}
        </span>
        <span
          className="font-display text-2xl md:text-3xl font-light tabular-nums leading-none text-foreground inline-flex items-center gap-2"
        >
          {/* WCAG 1.4.3 — light band colors (#a0c4ff, #4facfe, #00f2fe, #f6d365)
              failed 4.5:1 on cream. Convey the active band via a colored
              swatch and keep the numeric value in the foreground color so it
              stays readable. Hide the swatch when empty or no band is lit. */}
          {!empty && activeBand && (
            <span
              className="inline-block h-3 w-3 rounded-sm border border-foreground/20"
              style={{ backgroundColor: activeBand.color }}
              aria-hidden="true"
            />
          )}
          {empty ? '—' : formatPrecipitation(mm, units)}
          <span className="text-xs ml-1 text-muted-foreground/70" style={{ fontFamily: "'Outfit', sans-serif" }}>
            {unitLabel}
          </span>
        </span>
      </div>
      <div className="relative h-2 overflow-hidden border border-foreground/15" aria-hidden="true">
        <div className="absolute inset-0 grid grid-cols-7">
          {bands.map((b, i) => (
            <div
              key={b.label}
              style={{
                backgroundColor: b.color,
                opacity: empty || bandIndex < 0 ? 0.18 : i === bandIndex ? 1 : 0.18,
                transition: "opacity 300ms ease-out",
              }}
              className="h-full"
            />
          ))}
        </div>
        {!empty && (
          <div
            className="absolute -top-1 h-5 w-0.5 bg-foreground"
            style={{ left: `${posPct}%`, boxShadow: "0 0 0 2px hsl(var(--background))" }}
          />
        )}
        {!empty && bandIndex >= 0 && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: `${((bandIndex + 0.5) / 7) * 100}%`,
              top: '-14px',
              transform: 'translateX(-50%)',
              color: activeBand!.color,
            }}
          >
            <Droplets className="h-3 w-3" />
          </div>
        )}
      </div>
      <div className="flex justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50 tabular-nums">
        <span>{units === 'us' ? '0.02' : '0.5'}</span>
        <span>{units === 'us' ? '0.2' : '5'}</span>
        <span>{units === 'us' ? '0.4' : '10'}</span>
        <span>{units === 'us' ? '0.8' : '20'}</span>
        <span>{units === 'us' ? '1.2+' : '30+'}</span>
      </div>
    </div>
  );
}

/* ── Quiet shelf: expanded compact metrics below attention thresholds ── */
type QuietKey = 'precip' | 'uv' | 'humidity' | 'wind';

interface QuietItem {
  /** Metric identity, also the `quiet-${id}` data-testid. (Not `key` —
   *  that's a React reserved prop stripped from the component. */
  id: QuietKey;
  Icon: LucideIcon;
  /** Localized metric name, e.g. "Wind" / "風". */
  label: string;
  /** Localized, unit-formatted value, e.g. "2 km/h" / "0.2 mm". */
  value: string;
}

function QuietShelf({ items, groupLabel }: { items: QuietItem[]; groupLabel: string }) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-6 gap-y-3"
      role="group"
      aria-label={groupLabel}
    >
      {items.map((item) => (
        <QuietChip key={item.id} {...item} />
      ))}
    </div>
  );
}

function QuietChip({ id, Icon, label, value }: QuietItem) {
  return (
    <div
      data-testid={`quiet-${id}`}
      aria-label={`${label}: ${value}`}
      className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] tabular-nums text-muted-foreground"
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
      <span>
        {label} {value}
      </span>
    </div>
  );
}
