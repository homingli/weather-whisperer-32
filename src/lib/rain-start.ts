/**
 * "When will it rain?" — merges the district-accurate HKO gridded nowcast
 * (0–2 h, ~1 km cells, 30-min steps) with Open-Meteo's city-scale series
 * (15-min minutely_15, hourly fallback) into one rain-timeline verdict for
 * the RainStartBanner.
 *
 * Precision tiering: the verdict's `source` says which dataset produced the
 * leading segment — 'hko-grid' segments are district-accurate, while the
 * Open-Meteo grid snaps requests to ~7–8 km model cells (verified
 * 2026-09-17: Kwun Tong and Central return the identical cell), so UI copy
 * backed by Open-Meteo must not imply district precision.
 *
 * Window semantics — every series is normalized to explicit rain windows:
 *  - HKO nowcast step ending at T (raw "YYYYMMDDHHmm") covers (T−30 min, T].
 *  - Open-Meteo minutely_15 value at T is the preceding-15-minute sum, so it
 *    covers (T−15 min, T].
 *  - Open-Meteo hourly value at T is the preceding-hour sum, so it covers
 *    (T−60 min, T] (aggregation convention per Open-Meteo docs).
 * Timestamps that survived a localStorage round-trip arrive as ISO strings
 * (storage.ts writes WeatherData with JSON.stringify and never revives
 * Dates), so every adapter coerces via `new Date()` and drops NaN rows.
 */

import { type RainGrid, hkoStepEndToEpoch, sampleRainGridAt } from './rainfallGrid';
import type { HourlyForecast, MinutelyPrecipitation } from './weather/types';

/** One normalized rain window. */
export interface RainStep {
  /** Epoch ms when the rain window opens. */
  startMs: number;
  /** Epoch ms when the window closes (startMs + duration). */
  endMs: number;
  /** Forecast rain in mm for this window. */
  mm: number;
}

export type RainStartSource = 'hko-grid' | 'open-meteo';
export type RainStartStatus = 'raining-now' | 'rain-expected' | 'no-rain';

export interface RainStartForecast {
  status: RainStartStatus;
  /** Epoch ms rain is expected to begin (start of the first wet window). */
  startsAt?: number;
  /** Minutes from `now` until `startsAt`, rounded up (≥ 1). */
  startsInMinutes?: number;
  /** Epoch ms the wet run should end (start of the first dry window after it). */
  endsAt?: number;
  endsInMinutes?: number;
  /** Peak mm across the contiguous wet run starting at `startsAt`. */
  peakMm?: number;
  /** Which dataset produced the leading segment (the startsAt / raining-now window). */
  source: RainStartSource;
  /** Forward coverage of the merged series in minutes. */
  horizonMinutes: number;
  /** Normalized windows inside the horizon, for the banner sparkline. */
  series: RainStep[];
  computedAt: number;
}

/** A window with at least this much rain counts as "rain" (mm per step). */
export const RAIN_THRESHOLD_MM = 0.1;
/** Default forward horizon for the "no rain" verdict. */
export const DEFAULT_HORIZON_MINUTES = 24 * 60;
/** Cap on windows handed to the UI (96 × 15 min = 24 h). */
export const MAX_SERIES_STEPS = 96;

export const MINUTELY_STEP_MIN = 15;
export const HOURLY_STEP_MIN = 60;
export const HKO_STEP_MIN = 30;

/** Accepts the `Date | ISO string` duality of live vs cached-snapshot data. */
type TimeLike = number | string | Date;

function toEpoch(t: TimeLike): number {
  const v = t instanceof Date ? t.getTime() : new Date(t).getTime();
  return Number.isFinite(v) ? v : NaN;
}

/**
 * Open-Meteo minutely_15 → windows. The value at T is the preceding
 * 15-minute sum, so the window opens at T − 15 min.
 */
export function seriesFromMinutely(points?: MinutelyPrecipitation[]): RainStep[] {
  if (!points?.length) return [];
  const out: RainStep[] = [];
  for (const p of points) {
    const end = toEpoch(p.time);
    if (!Number.isFinite(end) || !Number.isFinite(p.precipitation)) continue;
    out.push({ startMs: end - MINUTELY_STEP_MIN * 60_000, endMs: end, mm: p.precipitation });
  }
  return out;
}

/**
 * Open-Meteo hourly → windows. The value at T is the preceding-hour sum
 * (Open-Meteo aggregates precipitation backwards; same convention as
 * minutely_15), so the window opens at T − 60 min.
 */
export function seriesFromHourly(points?: HourlyForecast[]): RainStep[] {
  if (!points?.length) return [];
  const out: RainStep[] = [];
  for (const p of points) {
    const end = toEpoch(p.time);
    if (!Number.isFinite(end) || !Number.isFinite(p.precipitation)) continue;
    out.push({ startMs: end - HOURLY_STEP_MIN * 60_000, endMs: end, mm: p.precipitation });
  }
  return out;
}

/**
 * HKO grid → per-step windows at the nearest cell to (lat, lon).
 * Returns null when the point is outside the nowcast domain or the grid has
 * no parseable step timestamps.
 */
export function seriesFromNowcastGrid(
  grid: RainGrid,
  lat: number,
  lon: number,
): RainStep[] | null {
  const values = sampleRainGridAt(grid, lat, lon);
  if (!values) return null;
  const out: RainStep[] = [];
  for (let s = 0; s < grid.stepCount; s++) {
    const end = hkoStepEndToEpoch(grid.stepEndTimesRaw[s] ?? '');
    if (end === null) continue;
    out.push({ startMs: end - HKO_STEP_MIN * 60_000, endMs: end, mm: values[s] });
  }
  return out.length > 0 ? out : null;
}

export interface ComputeRainStartInput {
  now?: number;
  thresholdMm?: number;
  horizonMinutes?: number;
  /** District-accurate HKO nowcast windows (0–2 h). Wins shared slots. */
  nowcast?: RainStep[] | null;
  /** City-scale Open-Meteo minutely_15 windows. */
  minutely?: RainStep[];
  /** Fallback when minutely is missing: hourly windows. */
  hourly?: RainStep[];
}

/**
 * Merge the available series into a rain-start verdict, or null when no
 * series has usable windows. The nowcast (when present) covers the nearest
 * windows; Open-Meteo minutely (else hourly) fills the rest. Shared
 * 30-minute slots are deduped with the nowcast winning, since both grids sit
 * on whole-minute UTC boundaries (HKT is a whole-hour offset).
 */
export function computeRainStart(input: ComputeRainStartInput): RainStartForecast | null {
  const now = input.now ?? Date.now();
  const threshold = input.thresholdMm ?? RAIN_THRESHOLD_MM;
  const horizonMs = (input.horizonMinutes ?? DEFAULT_HORIZON_MINUTES) * 60_000;

  const fine = input.minutely?.length ? input.minutely : input.hourly ?? [];
  const grid = input.nowcast ?? [];

  const byStart = new Map<number, RainStep>();
  for (const s of fine) byStart.set(s.startMs, s);
  for (const s of grid) byStart.set(s.startMs, s);

  // Drop history (windows that already closed); keep the window straddling
  // `now` — it is the "is it raining yet" probe. Sort earliest first.
  const merged = [...byStart.values()]
    .filter((s) => s.endMs > now)
    .sort((a, b) => a.startMs - b.startMs)
    .slice(0, MAX_SERIES_STEPS);
  if (merged.length === 0) return null;

  const gridStarts = new Set(grid.map((s) => s.startMs));
  const series = merged.filter((s) => s.startMs < now + horizonMs);
  // A tiny custom horizon can drop every merged window (all start beyond
  // it) — bail instead of dereferencing an empty tail below.
  if (series.length === 0) return null;
  const lastEnd = series[series.length - 1].endMs;
  const horizonMinutes = Math.max(0, Math.round((lastEnd - now) / 60_000));

  const firstWetIdx = series.findIndex((s) => s.mm >= threshold);
  if (firstWetIdx < 0) {
    return {
      status: 'no-rain',
      // The "no rain" claim is only ever backed by Open-Meteo (the grid
      // covers 2 h at most) unless the grid is all we have.
      source: fine.length > 0 ? 'open-meteo' : 'hko-grid',
      horizonMinutes,
      series,
      computedAt: now,
    };
  }

  const firstWet = series[firstWetIdx];
  const source: RainStartSource = gridStarts.has(firstWet.startMs) ? 'hko-grid' : 'open-meteo';

  // Walk the contiguous wet run to its end and peak.
  let peak = firstWet.mm;
  let endsAt: number | undefined;
  for (let i = firstWetIdx + 1; i < series.length; i++) {
    if (series[i].mm < threshold) {
      endsAt = series[i].startMs;
      break;
    }
    peak = Math.max(peak, series[i].mm);
  }

  // A window that already opened and is wet counts as raining now. (On the
  // hourly fallback this is optimistic — the mm could land later in the
  // bucket — but hourly is only used when minutely is unavailable.)
  if (firstWet.startMs <= now) {
    return {
      status: 'raining-now',
      endsAt,
      endsInMinutes: endsAt !== undefined ? Math.max(0, Math.round((endsAt - now) / 60_000)) : undefined,
      peakMm: peak,
      source,
      horizonMinutes,
      series,
      computedAt: now,
    };
  }

  return {
    status: 'rain-expected',
    startsAt: firstWet.startMs,
    startsInMinutes: Math.max(1, Math.round((firstWet.startMs - now) / 60_000)),
    endsAt,
    endsInMinutes: endsAt !== undefined ? Math.max(0, Math.round((endsAt - now) / 60_000)) : undefined,
    peakMm: peak,
    source,
    horizonMinutes,
    series,
    computedAt: now,
  };
}
