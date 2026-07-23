import { memo, useMemo, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { CurrentWeather as CurrentWeatherType, HourlyForecast, DailyForecast, getWeatherIcon, getWeatherDescription } from "@/lib/weather";
import { SENTINEL_THRESHOLD } from "@/lib/constants";
import { Umbrella, UmbrellaOff, Sunrise, Sunset, ArrowUp, ArrowDown, MoveUp, Droplets, Sun } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatInTimezone, appLocale } from "@/lib/utils";
import { LocalClock } from "./LocalClock";

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

export const CurrentWeather = memo(({ weather, hourlyForecast, dailyForecast, timezone, compact = false }: CurrentWeatherProps) => {
  const { language, t } = useLanguage();
  const root = useRef<HTMLDivElement>(null);

  // Sentinel check — values from PLACEHOLDER_CURRENT use PLACEHOLDER_SENTINEL to signal "no data yet"
  const isEmpty = weather.apparentTemperature < SENTINEL_THRESHOLD;

  // Format a value: render `—` when placeholder sentinel detected
  const fmt = (v: number, suffix = '') => v < SENTINEL_THRESHOLD ? '—' : `${Math.round(v)}${suffix}`;

  // Wrap in useMemo to prevent unnecessary re-calculations on every second tick
  const needsUmbrella = useMemo(() => {
    const isCurrentlyRaining = (weather.precipitation ?? 0) > 2;
    const next6Hours = hourlyForecast.slice(0, 6);
    const firstRainyHour = next6Hours.find(hour => hour.precipitationProbability >= 25);
    return isCurrentlyRaining || !!firstRainyHour;
  }, [weather, hourlyForecast]);

  // GSAP entrance: hairline rule scaleX reveals, big numeral rises, fact blocks fade in
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

  // Safely compute next sun event and format time
  const sunEvent = useMemo(() => {
    if (!dailyForecast || !dailyForecast.sunrise || !dailyForecast.sunset) return null;
    if (weather.isDay) {
      return {
        type: 'sunset',
        time: formatInTimezone(new Date(dailyForecast.sunset), locale, {
          timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12,
        }),
        icon: Sunset,
      };
    }
    return {
      type: 'sunrise',
      time: formatInTimezone(new Date(dailyForecast.sunrise), locale, {
        timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12,
      }),
      icon: Sunrise,
    };
  }, [dailyForecast, weather.isDay, locale, timezone, hour12]);

  // Memoize UV style object derived from index
  const uvInfo = useMemo(() => {
    const uv = weather.uvIndex;
    if (uv == null) return { color: 'text-muted-foreground/60', bg: 'bg-muted/20' };
    if (uv <= 2) return { color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-700/10' };
    if (uv <= 5) return { color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-700/10' };
    if (uv <= 7) return { color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-700/10' };
    if (uv <= 10) return { color: 'text-rose-700 dark:text-rose-300', bg: 'bg-rose-700/10' };
    return { color: 'text-fuchsia-700 dark:text-fuchsia-300', bg: 'bg-fuchsia-700/10' };
  }, [weather.uvIndex]);

  return (
    <div
      ref={root}
      className={`editorial-card overflow-hidden ${compact ? 'p-6' : 'p-8 md:p-12 lg:p-14'}`}
    >
      {/* Top kicker row: date+time | edition label */}
      <div className={`flex items-baseline justify-between gap-4 cw-fade ${compact ? '' : 'mb-6'}`}>
        <span className="kicker text-muted-foreground">
          Daily Edition
        </span>
        <div className="text-right">
          <LocalClock timezone={timezone} />
        </div>
      </div>

      <div className="cw-rule h-px editorial-rule mb-8" />

      {/* Hero headline: big temperature + weather icon + description */}
      <header className={`grid gap-10 ${compact ? 'grid-cols-1 text-center' : 'md:grid-cols-[1fr_auto] md:items-end'}`}>
        <div className="overflow-hidden">
          <h1
            className="cw-rise block font-display text-[18vw] md:text-[200px] leading-[0.85] font-light tracking-[-0.04em]"
            aria-label={isEmpty ? '—' : `${Math.round(weather.apparentTemperature)} degrees`}
          >
            {fmt(weather.apparentTemperature, '°')}
          </h1>
        </div>
        <div className="cw-fade flex flex-col gap-3 max-w-xs">
          <span className="text-6xl md:text-7xl leading-none">{getWeatherIcon(weather.weatherCode, weather.isDay)}</span>
          <span className="kicker text-muted-foreground">Conditions</span>
          <p className="font-display text-2xl md:text-3xl italic font-light leading-tight">
            {getWeatherDescription(weather.weatherCode)}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('weather.feelsLike')} — {fmt(weather.apparentTemperature, '°')}
          </p>
        </div>
      </header>

      <div className="cw-rule h-px editorial-rule my-8" />

      {/* Fact block row 1: high/low, sun event, umbrella */}
      <div className={`grid gap-x-10 gap-y-6 cw-fade ${compact ? 'grid-cols-2' : 'md:grid-cols-4'}`}>
        <FactBlock
          icon={ArrowUp}
          label={t('daily.high')}
          value={fmt(dailyForecast?.temperatureMax, '°')}
        />
        <FactBlock
          icon={ArrowDown}
          label={t('daily.low')}
          value={fmt(dailyForecast?.temperatureMin, '°')}
        />
        <FactBlock
          icon={sunEvent?.icon ?? Sunset}
          label={sunEvent?.type === 'sunrise' ? t('daily.sunrise') : t('daily.sunset')}
          value={sunEvent?.time ?? '—:—'}
        />
        <FactBlock
          icon={needsUmbrella ? Umbrella : UmbrellaOff}
          label={t('umbrella.label')}
          value={needsUmbrella ? t('umbrella.yes') : t('umbrella.no')}
        />
      </div>

      <div className="cw-rule h-px editorial-rule my-8" />

      {/* Fact block row 2: humidity, wind, UV, precip */}
      <div className={`grid gap-x-10 gap-y-6 cw-fade ${compact ? 'grid-cols-2' : 'md:grid-cols-4'}`}>
        <FactBlock icon={Droplets} label={t('weather.humidity')} value={fmt(weather.humidity, '%')} />
        <FactBlock
          icon={MoveUp}
          label={t('weather.wind')}
          value={`${fmt(weather.windSpeed)} ${t('unit.kmh')}`}
          rotation={isEmpty ? 0 : weather.windDirection + 180}
        />
        <FactBlock
          icon={Sun}
          label={t('weather.uvIndex')}
          value={isEmpty ? '—' : weather.uvIndex == null ? '--' : weather.uvIndex.toFixed(1)}
          iconClass={isEmpty ? 'text-muted-foreground/30' : uvInfo.color}
        />
        <FactBlock
          icon={Droplets}
          label="Precip"
          value={`${fmt(weather.precipitation, ' mm')}`}
        />
      </div>
    </div>
  );
});

CurrentWeather.displayName = 'CurrentWeather';

interface FactBlockProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  rotation?: number;
  iconClass?: string;
}

function FactBlock({ icon: Icon, label, value, rotation, iconClass }: FactBlockProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className={`flex items-center gap-2 kicker text-muted-foreground`}>
        <span
          className={iconClass ?? 'text-foreground'}
          style={rotation != null ? { transform: `rotate(${rotation}deg)`, display: 'inline-block' } : undefined}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span>{label}</span>
      </div>
      <div className="font-display text-2xl md:text-3xl font-light tabular-nums leading-tight">
        {value}
      </div>
    </div>
  );
}