import { memo, useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { CurrentWeather as CurrentWeatherType, HourlyForecast, DailyForecast, getWeatherIcon, getWeatherDescription } from "@/lib/weather";
import { SENTINEL_THRESHOLD } from "@/lib/constants";
import { Umbrella, UmbrellaOff, Sunrise, Sunset, Droplets, Sun } from "lucide-react";
import { useLanguage, formatString } from "@/contexts/LanguageContext";
import { formatInTimezone, appLocale } from "@/lib/utils";
import { LocalClock } from "./LocalClock";

/** Convert a meteorological wind direction (0-360°, 0 = N) to a compass abbreviation. */
function windCompass(deg: number): string {
  if (deg == null || isNaN(deg)) return "—";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(((deg % 360) / 45)) % 8];
}

if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP);
}

interface CurrentWeatherProps {
  weather: CurrentWeatherType;
  hourlyForecast: HourlyForecast[];
  dailyForecast?: DailyForecast;
  locationName?: string;
  timezone?: string;
  /** Force single-column mobile layout regardless of viewport width */
  compact?: boolean;
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
  { max: 0.5,       color: "#a0c4ff", label: "< 0.5 mm" },
  { max: 2,         color: "#4facfe", label: "0.5 – 2 mm" },
  { max: 5,         color: "#00f2fe", label: "2 – 5 mm" },
  { max: 10,        color: "#43e97b", label: "5 – 10 mm" },
  { max: 20,        color: "#f6d365", label: "10 – 20 mm" },
  { max: 30,        color: "#ff0844", label: "20 – 30 mm" },
  { max: Infinity,  color: "#9d0b0b", label: "> 30 mm" },
];

function rainfallBandIndexFor(mm: number): number {
  if (!isFinite(mm) || mm < 0) return 0;
  for (let i = 0; i < RAINFALL_BANDS.length; i++) if (mm <= RAINFALL_BANDS[i].max) return i;
  return RAINFALL_BANDS.length - 1;
}

export const CurrentWeather = memo(({ weather, hourlyForecast, dailyForecast, timezone, compact = false }: CurrentWeatherProps) => {
  const { language, t } = useLanguage();
  const root = useRef<HTMLDivElement>(null);

  const isEmpty = weather.apparentTemperature < SENTINEL_THRESHOLD;

  const fmt = (v: number, suffix = '') => v < SENTINEL_THRESHOLD ? '—' : `${Math.round(v)}${suffix}`;

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
  const precipBandIndex = useMemo(
    () => rainfallBandIndexFor(weather.precipitation ?? 0),
    [weather.precipitation],
  );
  const humidityPct = isEmpty ? 0 : Math.max(0, Math.min(100, weather.humidity));
  const windDeg = isEmpty ? 0 : weather.windDirection;

  return (
    <div
      ref={root}
      className={`editorial-card overflow-hidden ${compact ? 'p-6' : 'p-8 md:p-12 lg:p-14'}`}
    >
      {/* Top kicker row */}
      <div className={`flex items-baseline justify-between gap-4 cw-fade ${compact ? '' : 'mb-6'}`}>
        <span className="kicker text-muted-foreground">Daily Edition</span>
        <div className="text-right">
          <LocalClock timezone={timezone} />
        </div>
      </div>

      <div className="cw-rule h-px editorial-rule mb-8" />

      {/* Hero — desktop 2-col (temp | icon+conditions), mobile side-by-side icon+temp */}
      {compact ? (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-center gap-6">
            <span
              className="text-[88px] sm:text-[110px] leading-none select-none drop-shadow-[0_4px_24px_rgba(0,0,0,0.35)]"
              role="img"
              aria-label={getWeatherDescription(weather.weatherCode)}
            >
              {getWeatherIcon(weather.weatherCode, weather.isDay)}
            </span>
            <div className="overflow-hidden">
              <h1
                className="cw-rise block font-display text-[28vw] leading-[0.85] font-light tracking-[-0.04em]"
                aria-label={isEmpty ? '—' : `${Math.round(weather.apparentTemperature)} degrees`}
              >
                {fmt(weather.apparentTemperature, '°')}
              </h1>
            </div>
          </div>
          <p className="cw-fade text-center font-display italic text-xl text-muted-foreground">
            {getWeatherDescription(weather.weatherCode)}
          </p>
          <p className="cw-fade text-center kicker text-muted-foreground/60">
            {t('weather.feelsLike')} {fmt(weather.apparentTemperature, '°')}
          </p>
        </div>
      ) : (
        <header className="grid gap-10 md:grid-cols-[1fr_auto] md:items-end">
          <div className="overflow-hidden">
            <h1
              className="cw-rise block font-display text-[18vw] md:text-[200px] leading-[0.85] font-light tracking-[-0.04em]"
              aria-label={isEmpty ? '—' : `${Math.round(weather.apparentTemperature)} degrees`}
            >
              {fmt(weather.apparentTemperature, '°')}
            </h1>
          </div>
          <div className="cw-fade flex flex-col gap-3 max-w-xs">
            <span
              className="text-6xl md:text-7xl leading-none select-none"
              role="img"
              aria-label={getWeatherDescription(weather.weatherCode)}
            >
              {getWeatherIcon(weather.weatherCode, weather.isDay)}
            </span>
            <span className="kicker text-muted-foreground">Conditions</span>
            <p className="font-display text-2xl md:text-3xl italic font-light leading-tight">
              {getWeatherDescription(weather.weatherCode)}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('weather.feelsLike')} {fmt(weather.apparentTemperature, '°')}
            </p>
          </div>
        </header>
      )}

      <div className="cw-rule h-px editorial-rule my-8" />

      {/* Mid section — umbrella + sunrise/sunset (top), temperature range bar (full width) */}
      <div className={`grid gap-x-10 gap-y-6 cw-fade ${compact ? 'grid-cols-2' : 'md:grid-cols-3'}`}>
        <FactBlock
          icon={needsUmbrella ? Umbrella : UmbrellaOff}
          label={t('umbrella.label')}
          value={needsUmbrella ? t('umbrella.yes') : t('umbrella.no')}
          valueTone={needsUmbrella ? 'text-cyan-400' : 'text-muted-foreground/70'}
        />
        <SunriseSunsetCountdown
          type={sunEvent?.type ?? 'sunset'}
          time={sunEvent?.time ?? '—:—'}
          icon={sunEvent?.icon ?? Sunset}
          empty={!sunEvent}
        />
        <div className={compact ? 'col-span-2' : 'col-span-1'}>
          <RangeBar
            low={dailyForecast?.temperatureMin}
            high={dailyForecast?.temperatureMax}
            current={weather.apparentTemperature}
            label={t('daily.today')}
            empty={isEmpty}
          />
        </div>
      </div>

      <div className="cw-rule h-px editorial-rule my-8" />

      {/* Bottom section — creative visualizations */}
      <div className={`grid gap-x-10 gap-y-8 cw-fade ${compact ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
        <PrecipBar
          mm={weather.precipitation ?? 0}
          bandIndex={precipBandIndex}
          empty={isEmpty}
        />
        <UvChip uv={weather.uvIndex} band={uvBand} label={t('weather.uvIndex')} empty={isEmpty} />
        <HumidityBar pct={humidityPct} label={t('weather.humidity')} empty={isEmpty} />
        <WindCompass
          deg={windDeg}
          speed={weather.windSpeed}
          label={t('weather.wind')}
          empty={isEmpty}
          label_kmh={t('unit.kmh', 'km/h')}
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
  low, high, current, label, empty,
}: { low?: number; high?: number; current: number; label: string; empty: boolean }) {
  const lo = low ?? current;
  const hi = high ?? current;
  const range = Math.max(hi - lo, 0.1);
  const clamped = Math.max(lo, Math.min(hi, current));
  const currentPct = ((clamped - lo) / range) * 100;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="kicker text-muted-foreground">{label}</span>
        <span className="font-display text-2xl md:text-3xl font-light tabular-nums leading-none">
          {empty ? '—' : `${Math.round(current)}°`}
        </span>
      </div>
      <div className="relative h-2 bg-foreground/10" style={{
        background: "linear-gradient(90deg, #3b82f6 0%, #06b6d4 35%, #eab308 65%, #ef4444 100%)",
      }}>
        <div
          className="absolute -top-1.5 -translate-x-1/2 h-5 w-5 rotate-45 border border-foreground bg-background"
          style={{ left: `${currentPct}%` }}
          aria-hidden
        />
      </div>
      <div className="flex justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 tabular-nums">
        <span>{empty ? '—' : `${Math.round(lo)}°`}</span>
        <span>{empty ? '—' : `${Math.round(hi)}°`}</span>
      </div>
    </div>
  );
}

/* ── Sunrise / sunset countdown: "in 4h 32m" with HH:MM subtext ─────── */
function SunriseSunsetCountdown({
  type, time, icon: Icon, empty,
}: { type: 'sunrise' | 'sunset'; time: string; icon: React.ComponentType<{ className?: string }>; empty: boolean }) {
  const { t } = useLanguage();
  const [, setNow] = useState(() => Date.now());

  // Re-tick every minute so the countdown stays current.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const countdown = useMemo(() => {
    if (empty) return { text: "—", isNow: false };
    const m = /^(\d{1,2}):(\d{2})$/.exec(time);
    if (!m) return { text: "—", isNow: false };
    const targetH = Number(m[1]);
    const targetM = Number(m[2]);
    const now = new Date();
    const target = new Date(now);
    target.setHours(targetH, targetM, 0, 0);
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
    const diffMs = target.getTime() - now.getTime();
    const totalMin = Math.floor(diffMs / 60_000);
    const hrs = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    const isNow = totalMin <= 1;
    let text: string;
    if (isNow) text = t('sun.now');
    else if (hrs > 0 && mins > 0) text = formatString(t('sun.inHoursMinutes'), String(hrs), String(mins));
    else if (hrs > 0) text = formatString(t('sun.inHours'), String(hrs));
    else text = formatString(t('sun.inMinutes'), String(mins));
    return { text, isNow };
  }, [time, empty, t]);

  const label = t(type === 'sunrise' ? 'daily.sunrise' : 'daily.sunset');

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 kicker text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <div className={`font-display text-2xl md:text-3xl font-light tabular-nums leading-tight ${countdown.isNow ? 'text-amber-400' : ''}`}>
        {empty ? '—' : countdown.text}
      </div>
      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground/60 tabular-nums">
        {empty ? '—' : time}
      </div>
    </div>
  );
}

/* ── Humidity: horizontal "bucket" bar with fill percent ───────────── */
function HumidityBar({ pct, label, empty }: { pct: number; label: string; empty: boolean }) {
  const ticks = [0, 25, 50, 75, 100];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="kicker text-muted-foreground inline-flex items-center gap-2">
          <Droplets className="h-3.5 w-3.5" />
          {label}
        </span>
        <span className="font-display text-2xl md:text-3xl font-light tabular-nums leading-none">
          {empty ? '—' : `${Math.round(pct)}%`}
        </span>
      </div>
      <div className="relative h-6 border border-foreground/15 bg-foreground/[0.04] overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-700 ease-out"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg, #bae6fd 0%, #38bdf8 60%, #0284c7 100%)",
          }}
          aria-hidden
        />
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute inset-y-0 w-px bg-foreground/15"
            style={{ left: `${t}%` }}
            aria-hidden
          />
        ))}
        {!empty && (
          <div
            className="absolute inset-y-[2px] left-0 border-r-2 border-foreground/40 mix-blend-overlay"
            style={{ width: `${pct}%` }}
            aria-hidden
          />
        )}
      </div>
      <div className="flex justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50 tabular-nums">
        <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
      </div>
    </div>
  );
}

/* ── Wind: arrow + degree + direction (no compass ring) ───────────── */
function WindCompass({
  deg, speed, label, empty, label_kmh,
}: { deg: number; speed: number; label: string; empty: boolean; label_kmh: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="kicker text-muted-foreground">{label}</span>
        <span className="font-display text-2xl md:text-3xl font-light tabular-nums leading-none">
          {empty ? '—' : `${Math.round(speed)}`}
          <span className="text-xs ml-1 text-muted-foreground/70 not-italic" style={{ fontFamily: "'Outfit', sans-serif" }}>
            {label_kmh}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-5">
        <div
          className="shrink-0 transition-transform duration-500"
          style={{ transform: `rotate(${deg}deg)` }}
          aria-label="wind direction"
        >
          <svg width="48" height="48" viewBox="0 0 48 48" role="img">
            <line x1="24" y1="40" x2="24" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <polygon points="24,4 18,14 30,14" fill="currentColor" />
          </svg>
        </div>
        <div className="flex flex-col leading-tight">
          <span className="font-display text-2xl tabular-nums leading-none">
            {empty ? '—' : `${Math.round(deg)}°`}
          </span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 mt-1">
            {empty ? '—' : windCompass(deg)}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── UV index: color-coded chip with exposure level ────────────────── */
function UvChip({
  uv, band, label, empty,
}: { uv: number | null; band: UvBand; label: string; empty: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="kicker text-muted-foreground inline-flex items-center gap-2">
          <Sun className="h-3.5 w-3.5" />
          {label}
        </span>
        <span
          className="font-display text-2xl md:text-3xl font-light tabular-nums leading-none px-2.5 py-0.5"
          style={{
            backgroundColor: empty ? "transparent" : band.bg,
            color: empty ? "currentColor" : band.text,
            border: empty ? "1px solid currentColor" : `1px solid ${band.border}`,
          }}
        >
          {empty ? '—' : uv == null ? '—' : uv.toFixed(1)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex h-2 flex-1 overflow-hidden border border-foreground/15">
          {UV_BANDS.slice(0, 5).map((b) => {
            const priorMax = UV_BANDS.indexOf(b) > 0 ? UV_BANDS[UV_BANDS.indexOf(b) - 1].max : 0;
            const segActive = !empty && uv != null && uv > priorMax && uv <= b.max;
            return (
              <div
                key={b.label}
                className="flex-1 transition-opacity duration-300"
                style={{
                  backgroundColor: b.bg,
                  opacity: segActive ? 1 : 0.18,
                }}
                aria-hidden
              />
            );
          })}
        </div>
        <span
          className="font-display text-sm uppercase tracking-[0.18em]"
          style={{ color: empty ? "currentColor" : band.bg }}
        >
          {empty ? '—' : band.label}
        </span>
      </div>
    </div>
  );
}

/* ── Precipitation: rainfall nowcast color bar with mm marker ──────── */
function PrecipBar({
  mm, bandIndex, empty,
}: { mm: number; bandIndex: number; empty: boolean }) {
  // Position the marker along the bar (linear scale up to 30 mm).
  const maxTick = 30;
  const mmClamped = Math.max(0, Math.min(mm, maxTick));
  const posPct = (mmClamped / maxTick) * 100;
  const activeBand = RAINFALL_BANDS[bandIndex];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="kicker text-muted-foreground inline-flex items-center gap-2">
          <Droplets className="h-3.5 w-3.5" />
          Precip
        </span>
        <span
          className="font-display text-2xl md:text-3xl font-light tabular-nums leading-none"
          style={{ color: empty ? "currentColor" : activeBand.color }}
        >
          {empty ? '—' : `${mm.toFixed(1)}`}
          <span className="text-xs ml-1 text-muted-foreground/70" style={{ fontFamily: "'Outfit', sans-serif" }}>
            mm
          </span>
        </span>
      </div>
      <div className="relative h-3 overflow-hidden border border-foreground/15">
        <div className="absolute inset-0 grid grid-cols-7">
          {RAINFALL_BANDS.map((b, i) => (
            <div
              key={b.label}
              style={{
                backgroundColor: b.color,
                opacity: empty ? 0.18 : i === bandIndex ? 1 : 0.18,
                transition: "opacity 300ms ease-out",
              }}
              className="h-full"
              aria-hidden
            />
          ))}
        </div>
        {!empty && (
          <div
            className="absolute -top-1 h-5 w-0.5 bg-foreground"
            style={{ left: `${posPct}%`, boxShadow: "0 0 0 2px hsl(var(--background))" }}
            aria-hidden
          />
        )}
      </div>
      <div className="flex justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50 tabular-nums">
        <span>&lt; 0.5</span>
        <span>5</span>
        <span>10</span>
        <span>20</span>
        <span>30+</span>
      </div>
    </div>
  );
}