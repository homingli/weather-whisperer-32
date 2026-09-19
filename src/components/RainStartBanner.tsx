import { memo, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CloudRain, Umbrella } from 'lucide-react';
import { useLanguage, formatString } from '@/contexts/LanguageContext';
import type { WeatherData } from '@/lib/weather';
import {
  computeRainStart,
  seriesFromMinutely,
  seriesFromHourly,
  seriesFromNowcastGrid,
  MINUTELY_STEP_MIN,
  RAIN_THRESHOLD_MM,
  type RainStartForecast,
} from '@/lib/rain-start';
import type { RainGrid } from '@/lib/rainfallGrid';
import { getDateTimeFormatter } from '@/lib/utils';

/**
 * Cached nowcast entry in the React Query cache, written by RainfallMapInner.
 * Structural on purpose: the banner only needs the grid, and importing the
 * map component's types would pull MapLibre into this module's chunk.
 */
interface NowcastCacheEntry {
  grid: RainGrid;
}

/** Windows rendered in the sparkline (24 × 15 min = 6 h strip). */
const SPARKLINE_STEPS = 24;

/**
 * The verdict scans exactly the span the sparkline can show. Text and strip
 * used to diverge (text scanned 24 h, bars showed 6 h), so a wet window 23 h
 * out would announce "rain expected" over an all-dry strip. The label passed
 * as the {0} of `rainstart.horizon` derives from this constant — keep them
 * in sync by construction.
 */
const VERDICT_HORIZON_MIN = SPARKLINE_STEPS * MINUTELY_STEP_MIN;

/**
 * "When will it rain?" — a thin strip above the at-a-glance row.
 *
 * Merges Open-Meteo's city-scale minutely/hourly precipitation (already in
 * the unified weather payload, no extra request) with the HKO gridded
 * nowcast whenever the rain map has populated the shared query cache — the
 * 0–2 h segment then upgrades to district accuracy. The verdict is capped to
 * the sparkline's 6-hour span (`VERDICT_HORIZON_MIN`) so the text and the
 * bars always describe the same window. Re-renders on a minute
 * tick so relative phrasing ("in ~45 min") stays current while mounted.
 *
 * Renders only when rain is expected or already falling — a no-rain verdict
 * hides the strip (the at-a-glance row's rain chips carry the all-clear
 * case), as does a payload with no usable series, so a degraded fetch just
 * loses the row instead of showing a dead strip.
 */
export const RainStartBanner = memo(
  ({ weather, latitude, longitude, className }: RainStartBannerProps) => {
    const { t, language } = useLanguage();

    // Read-only subscription to the rain map's query cache. `enabled: false`
    // never fetches — if the map was never opened this stays undefined and
    // the banner runs on Open-Meteo alone (the 2.7 MB CSV stays opt-in).
    const { data: nowcast } = useQuery<NowcastCacheEntry>({
      queryKey: ['hkoGriddedRainfallNowcast'],
      enabled: false,
      staleTime: Infinity,
    });

    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
      const id = setInterval(() => setNow(Date.now()), 60_000);
      return () => clearInterval(id);
    }, []);

    const forecast = useMemo(
      () =>
        computeRainStart({
          now,
          horizonMinutes: VERDICT_HORIZON_MIN,
          nowcast: nowcast ? seriesFromNowcastGrid(nowcast.grid, latitude, longitude) : null,
          minutely: seriesFromMinutely(weather.minutely),
          hourly: seriesFromHourly(weather.hourly),
        }),
      [now, nowcast, latitude, longitude, weather.minutely, weather.hourly],
    );

    if (!forecast || forecast.status === 'no-rain') return null;

    return (
      <RainStartStrip
        forecast={forecast}
        t={t}
        language={language}
        timezone={weather.timezone}
        className={className}
      />
    );
  },
);

RainStartBanner.displayName = 'RainStartBanner';

interface RainStartBannerProps {
  weather: WeatherData;
  latitude: number;
  longitude: number;
  /** Spacing hook for the parent layout (mobile passes `mb-2`; desktop sits
   *  inside a `space-y-6` flow that handles the gap itself). */
  className?: string;
}

function RainStartStrip({
  forecast,
  t,
  language,
  timezone,
  className,
}: {
  forecast: RainStartForecast;
  t: (key: string, fallback?: string) => string;
  language: 'en' | 'tc';
  timezone?: string;
  className?: string;
}) {
  const timeFmt = getDateTimeFormatter(language === 'tc' ? 'zh-HK' : 'en-GB', {
    timeZone: timezone || undefined,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const fmtTime = (ms: number) => timeFmt.format(new Date(ms));
  const fmtDuration = (min: number) => {
    if (min < 60) return formatString(t('rainstart.inMinutes'), min);
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0
      ? formatString(t('rainstart.inHoursMin'), h, m)
      : formatString(t('rainstart.inHours'), h);
  };

  let text: string;
  // Live-region twin of `text`: carries only verdict-stable parts (clock
  // times, horizon). The relative "in ~N min" clause mutates on every
  // minute tick and must stay OUT of the role="status" span — polite live
  // regions announce content changes, and a per-minute countdown would
  // chatter at screen-reader users for as long as the strip is mounted.
  let liveText: string;
  let Icon: typeof CloudRain;
  switch (forecast.status) {
    case 'raining-now':
      text =
        forecast.endsAt !== undefined
          ? formatString(t('rainstart.nowUntil'), fmtTime(forecast.endsAt))
          : t('rainstart.now');
      liveText = text;
      Icon = Umbrella;
      break;
    case 'rain-expected':
      text = formatString(
        t('rainstart.expectedIn'),
        fmtTime(forecast.startsAt!),
        fmtDuration(forecast.startsInMinutes ?? 0),
      );
      liveText = formatString(t('rainstart.expectedAt'), fmtTime(forecast.startsAt!));
      Icon = CloudRain;
      break;
    case 'no-rain':
      // Unreachable — the banner hides the strip on a no-rain verdict.
      return null;
  }

  // The nowcast window is district-accurate; anything Open-Meteo-backed is
  // city-scale (~8 km cells) — say so instead of implying precision.
  const cityWide = forecast.source === 'open-meteo';
  if (cityWide) liveText = `${liveText} (${t('rainstart.citywide')})`;

  return (
    <div
      className={`flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border border-border bg-card px-4 py-2 text-xs tabular-nums text-muted-foreground${className ? ` ${className}` : ''}`}
    >
      {/* Resolution qualifier leads the strip: it scopes everything that
          follows before the eye reaches the verdict. */}
      {cityWide && <span className="kicker">{t('rainstart.citywide')}</span>}
      <span className="inline-flex items-center gap-x-2">
        <Icon
          className="h-4 w-4 shrink-0 text-weather-rain"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <span className="text-foreground/90">{text}</span>
      </span>
      <Sparkline series={forecast.series} />
      {/* Label shares the Sparkline's render condition (≥ 2 bars) so a
          single-window series never leaves an orphaned "NEXT 6 H" caption. */}
      {forecast.series.length >= 2 && (
        <span className="kicker text-muted-foreground/70">
          {formatString(t('rainstart.horizon'), Math.round(VERDICT_HORIZON_MIN / 60))}
        </span>
      )}
      <span role="status" className="sr-only">
        {liveText}
      </span>
    </div>
  );
}

/** Decorative upcoming-rain bars (first wet window highlighted). */
function Sparkline({ series }: { series: RainStartForecast['series'] }) {
  const bars = series.slice(0, SPARKLINE_STEPS);
  if (bars.length < 2) return null;
  const scaleMax = Math.max(0.5, ...bars.map((b) => b.mm));
  const firstWet = bars.findIndex((b) => b.mm >= RAIN_THRESHOLD_MM);
  return (
    <span aria-hidden="true" className="flex items-end gap-[3px] h-4">
      {bars.map((b, i) => {
        const wet = b.mm >= RAIN_THRESHOLD_MM;
        const heightPct = wet ? Math.max(20, Math.round((b.mm / scaleMax) * 100)) : 12;
        // The bar where rain begins gets the full tone; later wet bars sit
        // at 60% so the start reads as the timing marker the strip exists for.
        const tone = i === firstWet ? 'bg-weather-rain' : 'bg-weather-rain/60';
        return (
          <span
            key={i}
            className={`w-1 rounded-sm ${wet ? tone : 'bg-muted-foreground/25'}`}
            style={{ height: `${heightPct}%` }}
          />
        );
      })}
    </span>
  );
}
