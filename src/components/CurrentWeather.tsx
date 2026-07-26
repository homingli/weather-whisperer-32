import { memo, useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { CurrentWeather as CurrentWeatherType, HourlyForecast, DailyForecast, getWeatherIconNode, weatherDescriptionKey } from "@/lib/weather";
import { SENTINEL_THRESHOLD } from "@/lib/constants";
import { Umbrella, UmbrellaOff, Sunrise, Sunset, Droplets, Sun, Wind, Droplet, Thermometer, AlertTriangle } from "lucide-react";
import { useLanguage, formatString } from "@/contexts/LanguageContext";
import { useUnits } from "@/contexts/UnitsContext";
import type { Units } from "@/lib/units";
import {
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
}

/* ── UV index banding (WHO-aligned colors and exposure levels) ─────── */
type UvBand = { max: number; bg: string; text: string; border: string; label: string };

const UV_BANDS: UvBand[] = [
  { max: 2,    bg: "#16a34a", text: "#ffffff", border: "#15803d", label: "Low" },
  { max: 5,    bg: "#facc15", text: "#1a1a1a", border: "#ca8a04", label: "Moderate" },
  { max: 7,    bg: "#f97316", text: "#ffffff", border: "#c2410c", label: "High" },
  { max: 10,   bg: "#dc2626", text: "#ffffff", border: "#991b1b", label: "Very High" },
  { max: 1000, bg: "#7c3aed", text: "#ffffff", border: "#5b21b6", label: "Extreme" },
];

function uvBandFor(uv: number | null): UvBand {
  if (uv == null) return { max: 0, bg: "transparent", text: "currentColor", border: "currentColor", label: "—" };
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

export const CurrentWeather = memo(({ weather, hourlyForecast, dailyForecast, timezone }: CurrentWeatherProps) => {
  const { language, t } = useLanguage();
  const { units } = useUnits();
  const root = useRef<HTMLDivElement>(null);

  const isEmpty = weather.apparentTemperature < SENTINEL_THRESHOLD;

  const needsUmbrella = useMemo(() => {
    const isCurrentlyRaining = (weather.precipitation ?? 0) > 2;
    const next6Hours = hourlyForecast.slice(0, 6);
    const firstRainyHour = next6Hours.find(hour => hour.precipitationProbability >= 25);
    return isCurrentlyRaining || !!firstRainyHour;
  }, [weather, hourlyForecast]);

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from(".cw-rule", {
        scaleX: 0, transformOrigin: "left center", duration: 1.0, ease: "power3.inOut", stagger: 0.08,
      });
      gsap.from(".cw-rise", {
        yPercent: 100, duration: 0.9, ease: "power3.out", stagger: 0.08, delay: 0.15,
      });
      gsap.from(".cw-fade", {
        autoAlpha: 0, duration: 0.7, ease: "power2.out", stagger: 0.06, delay: 0.3,
      });
    });
    return () => mm.revert();
  }, { scope: root });

  const locale = appLocale(language);
  const hour12 = language !== 'tc';

  const sunEvent = useMemo(() => {
    if (!dailyForecast || !dailyForecast.sunrise || !dailyForecast.sunset) return null;
    if (weather.isDay) {
      return {
        type: 'sunset' as const,
        time: formatInTimezone(new Date(dailyForecast.sunset), locale, {
          timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12,
        }),
        icon: Sunset,
      };
    }
    return {
      type: 'sunrise' as const,
      time: formatInTimezone(new Date(dailyForecast.sunrise), locale, {
        timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12,
      }),
      icon: Sunrise,
    };
  }, [dailyForecast, weather.isDay, locale, timezone, hour12]);

  const uvBand = useMemo(() => uvBandFor(weather.uvIndex), [weather.uvIndex]);
  const humidityPct = isEmpty ? 0 : Math.max(0, Math.min(100, weather.humidity));
  const windDeg = isEmpty ? 0 : weather.windDirection;

  return (
    <div
      ref={root}
      className="editorial-card overflow-hidden p-6 sm:p-8 md:p-12 lg:p-14"
    >
      <div className="flex items-baseline justify-between gap-4 cw-fade mb-6">
        <span className="kicker text-muted-foreground">{t('header.dailyEdition')}</span>
      </div>

      <div className="cw-rule h-px editorial-rule mb-8" />

      {/* Today's temperature range sits above the hero so the day's low/high context is set before the headline number. */}
      <div className="mb-8 cw-fade">
        <RangeBar
          low={dailyForecast?.temperatureMin}
          high={dailyForecast?.temperatureMax}
          current={weather.temperature}
          label={t('label.temperature')}
          empty={isEmpty}
          units={units}
        />
      </div>

      {/* Feels-like kicker above the hero so the big number is read as apparent temperature. */}
      <p className="cw-fade kicker text-muted-foreground mb-2 text-center md:text-left">
        {t('weather.feelsLike')}
      </p>

      {/* Hero — responsive: stacked on mobile (icon over temp), 2-col on md+ (temp | icon+conditions) */}
      <header className="grid gap-10 md:grid-cols-[1fr_auto] md:items-end">
        <div className="overflow-hidden">
          <h1 className="cw-rise block font-display text-[22vw] md:text-[160px] leading-[0.85] font-light tracking-[-0.04em]">
            {formatHeroTemperature(weather.apparentTemperature, units, SENTINEL_THRESHOLD)}
          </h1>
        </div>
        <div className="cw-fade flex flex-col items-center gap-3 max-w-xs md:items-start">
          <span
            className="inline-flex items-center justify-center text-foreground leading-none select-none"
            role="img"
            aria-label={t(weatherDescriptionKey(weather.weatherCode))}
          >
            {(() => {
              const Icon = getWeatherIconNode(weather.weatherCode, weather.isDay);
              return <Icon className="h-[88px] w-[88px] md:h-20 md:w-20" strokeWidth={1.25} />;
            })()}
          </span>
          <p className="font-display text-xl md:text-3xl italic font-light leading-tight text-center md:text-left">
            {t(weatherDescriptionKey(weather.weatherCode))}
          </p>
        </div>
      </header>

      <div className="cw-rule h-px editorial-rule my-8" />

      {/* Mid section — umbrella + sunrise/sunset */}
      <div className="grid grid-cols-2 md:grid-cols-2 gap-x-10 gap-y-6 cw-fade">
        <FactBlock
          icon={needsUmbrella ? Umbrella : UmbrellaOff}
          label={t('umbrella.label')}
          value={needsUmbrella ? t('umbrella.yes') : t('umbrella.no')}
          valueTone={needsUmbrella ? 'text-severity-info' : 'text-muted-foreground/80'}
        />
        <SunriseSunsetCountdown
          type={sunEvent?.type ?? 'sunset'}
          time={sunEvent?.time ?? '—:—'}
          icon={sunEvent?.icon ?? Sunset}
          empty={!sunEvent}
          timezone={timezone}
        />
      </div>

      <div className="cw-rule h-px editorial-rule my-8" />

      {/* Bottom section — creative visualizations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8 cw-fade">
        <PrecipBar
          mm={weather.precipitation ?? 0}
          empty={isEmpty}
          units={units}
        />
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
    </div>
  );
});

CurrentWeather.displayName = 'CurrentWeather';

/* ── Fact block (icon + label + value) ──────────────────────────────── */
interface FactBlockProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  rotation?: number;
  iconClass?: string;
  valueTone?: string;
}

function FactBlock({ icon: Icon, label, value, rotation, iconClass, valueTone }: FactBlockProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 kicker text-muted-foreground">
        <span
          className={iconClass ?? 'text-foreground'}
          style={rotation != null ? { transform: `rotate(${rotation}deg)`, display: 'inline-block' } : undefined}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span>{label}</span>
      </div>
      <div className={`font-display text-2xl md:text-3xl font-light tabular-nums leading-tight ${valueTone ?? ''}`}>
        {value}
      </div>
    </div>
  );
}

/* ── Temperature range bar: low ── current ── high ──────────────────── */
function RangeBar({
  low, high, current, label, empty, units,
}: { low?: number; high?: number; current: number; label: string; empty: boolean; units: Units }) {
  const lo = low ?? current;
  const hi = high ?? current;
  const range = Math.max(hi - lo, 0.1);
  const clamped = Math.max(lo, Math.min(hi, current));
  const currentPct = ((clamped - lo) / range) * 100;
  const loStr = empty ? '—' : formatTemperature(lo, units);
  const hiStr = empty ? '—' : formatTemperature(hi, units);
  const curStr = empty ? '—' : formatTemperature(current, units);
  return (
    <div
      className="flex flex-col gap-3"
      aria-label={
        empty
          ? `${label}: range unavailable`
          : `${label}: range ${loStr} to ${hiStr}, currently ${curStr}`
      }
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="kicker text-muted-foreground inline-flex items-center gap-2">
          <Thermometer className="h-3.5 w-3.5" />
          {label}
        </span>
        <span className="font-display text-2xl md:text-3xl font-light tabular-nums leading-none">
          {curStr}
        </span>
      </div>
      <div className="relative h-2 bg-foreground/10" style={{
        background: "linear-gradient(90deg, #3b82f6 0%, #06b6d4 35%, #eab308 65%, #ef4444 100%)",
      }} aria-hidden="true">
        <div
          className="absolute -top-1.5 -translate-x-1/2 h-5 w-5 rotate-45 border border-foreground bg-background"
          style={{ left: `${currentPct}%` }}
          aria-hidden
        />
      </div>
      <div className="flex justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 tabular-nums">
        <span>{loStr}</span>
        <span>{hiStr}</span>
      </div>
    </div>
  );
}

/* ── Sunrise / sunset countdown: "in 4h 32m" with HH:MM subtext ─────── */

/**
 * Compute hours/minutes remaining until `timeStr` (HH:MM, optional AM/PM)
 * in the location's `timezone`. Falls back to browser local time when no
 * timezone is supplied.
 *
 * The Intl.DateTimeFormat path lets us compare clock times in a timezone
 * other than the user's browser, which is necessary when the displayed
 * sunrise is for a remote city.
 */
function diffToSunTime(
  timeStr: string,
  timezone: string | undefined,
): { hours: number; minutes: number; isNow: boolean } {
  const m = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(timeStr);
  if (!m) return { hours: 0, minutes: 0, isNow: false };

  let targetH = Number(m[1]);
  const targetM = Number(m[2]);
  const ampm = m[3]?.toUpperCase();
  if (ampm === 'PM' && targetH < 12) targetH += 12;
  if (ampm === 'AM' && targetH === 12) targetH = 0;

  let nowH: number;
  let nowM: number;
  if (timezone) {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const parts = fmt.formatToParts(new Date());
    nowH = Number(parts.find((p) => p.type === 'hour')?.value) % 24;
    nowM = Number(parts.find((p) => p.type === 'minute')?.value);
  } else {
    const now = new Date();
    nowH = now.getHours();
    nowM = now.getMinutes();
  }

  let diffMin = targetH * 60 + targetM - (nowH * 60 + nowM);
  if (diffMin <= 0) diffMin += 24 * 60;

  return {
    hours: Math.floor(diffMin / 60),
    minutes: diffMin % 60,
    isNow: diffMin <= 1,
  };
}

function SunriseSunsetCountdown({
  type, time, icon: Icon, empty, timezone,
}: {
  type: 'sunrise' | 'sunset';
  time: string;
  icon: React.ComponentType<{ className?: string }>;
  empty: boolean;
  timezone?: string;
}) {
  const { t } = useLanguage();
  const [, setNow] = useState(() => Date.now());

  // Re-tick every minute so the countdown stays current.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const countdown = useMemo(() => {
    if (empty) return { text: "—", isNow: false };
    const { hours: hrs, minutes: mins, isNow } = diffToSunTime(time, timezone);
    let text: string;
    if (isNow) text = t('sun.now');
    else if (hrs > 0 && mins > 0) text = formatString(t('sun.inHoursMinutes'), String(hrs), String(mins));
    else if (hrs > 0) text = formatString(t('sun.inHours'), String(hrs));
    else text = formatString(t('sun.inMinutes'), String(mins));
    return { text, isNow };
  }, [time, empty, timezone, t]);

  const label = t(type === 'sunrise' ? 'daily.sunrise' : 'daily.sunset');

  // Theme-tinted countdown value, calibrated to pass 3:1 on cream (large
  // text threshold) and 4.5:1 on the dark editorial bg. Sunrise: amber-600
  // #d97706; Sunset: blue-700 #1d4ed8. Single hex values intentionally —
  // same color reads correctly against both bgs. Icon stays muted to keep
  // the row label + icon a quiet caption above the prominent value.
  const tone = type === 'sunrise' ? '#d97706' : '#1d4ed8';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 kicker text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <div
        className="font-display text-2xl md:text-3xl font-light tabular-nums leading-tight"
        style={{ color: empty ? undefined : tone }}
      >
        {empty ? '—' : countdown.text}
      </div>
      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground/60 tabular-nums">
        {empty ? '—' : time}
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
          aria-label="wind direction (toward)"
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
  // -1 when uv is null (band is the null sentinel); otherwise the index
  // of the active band inside UV_BANDS. Drives the icon overlay position.
  const activeIdx = UV_BANDS.indexOf(band);
  const showIcon = !empty && uv != null && activeIdx >= 0;
  return (
    <div
      className="flex flex-col gap-3"
      aria-label={
        empty || uv == null
          ? `${label}: unavailable`
          : `${label}: ${uv.toFixed(1)}, ${band.label}`
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
              {band.label}
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
              key={b.label}
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
          className="font-display text-2xl md:text-3xl font-light tabular-nums leading-none"
          style={{ color: empty || !activeBand ? "currentColor" : activeBand.color }}
        >
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