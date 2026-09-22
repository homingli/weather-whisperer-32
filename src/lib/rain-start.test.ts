// Tests for the rain-start merge (HKO nowcast 0–2 h + Open-Meteo beyond).
// The window semantics under test:
//   - HKO step ending at T covers (T−30 min, T]
//   - minutely_15 value at T is the preceding-15-minute sum → (T−15 min, T]
//   - hourly value at T is the preceding-hour sum → (T−60 min, T]

import { describe, it, expect } from 'vitest';
import {
  computeRainStart,
  seriesFromMinutely,
  seriesFromHourly,
  RAIN_THRESHOLD_MM,
  MINUTELY_STEP_MIN,
  HOURLY_STEP_MIN,
  MAX_SERIES_STEPS,
  type RainStep,
} from './rain-start';
import type { HourlyForecast, MinutelyPrecipitation } from './weather/types';

const NOW = Date.UTC(2026, 8, 17, 8, 0); // 2026-09-17 08:00 UTC (16:00 HKT)
const MIN = 60_000;

/** Raw minutely_15 points at T, T+15m, … (value = preceding-window sum). */
function minutelyPoints(values: number[], startUnix = NOW / 1000): MinutelyPrecipitation[] {
  return values.map((precipitation, i) => ({
    time: new Date((startUnix + i * MINUTELY_STEP_MIN * 60) * 1000),
    precipitation,
  }));
}

/** Raw hourly points at T, T+1h, … (value = preceding-hour sum). */
function hourlyPoints(values: number[], startUnix = NOW / 1000): HourlyForecast[] {
  return values.map((precipitation, i) => ({
    time: new Date((startUnix + i * HOURLY_STEP_MIN * 60) * 1000),
    temperature: 0,
    weatherCode: 0,
    windSpeed: 0,
    windDirection: 0,
    precipitationProbability: 0,
    precipitation,
    isDay: true,
  }));
}

/** HKO-style grid windows: 30-min windows, the first ending at firstEndMs. */
function nowcastSeries(values: number[], firstEndMs: number): RainStep[] {
  return values.map((mm, i) => ({
    startMs: firstEndMs + (i - 1) * 30 * MIN,
    endMs: firstEndMs + i * 30 * MIN,
    mm,
  }));
}

describe('seriesFromMinutely', () => {
  it('opens each window 15 minutes before the timestamp (preceding sum)', () => {
    const steps = seriesFromMinutely(minutelyPoints([0.2, 0]));
    expect(steps).toHaveLength(2);
    expect(steps[0].endMs - steps[0].startMs).toBe(MINUTELY_STEP_MIN * MIN);
    expect(steps[0].endMs).toBe(steps[1].startMs);
  });

  it('accepts ISO-string times (cached localStorage snapshots) and drops NaN rows', () => {
    const steps = seriesFromMinutely([
      { time: new Date(NOW).toISOString() as unknown as Date, precipitation: 0.5 },
      { time: NaN as unknown as Date, precipitation: 0.5 },
    ]);
    expect(steps).toHaveLength(1);
    expect(steps[0].mm).toBe(0.5);
  });

  it('returns empty for undefined input', () => {
    expect(seriesFromMinutely(undefined)).toEqual([]);
  });
});

describe('seriesFromHourly', () => {
  it('opens each window 60 minutes before the timestamp (preceding sum)', () => {
    const steps = seriesFromHourly(hourlyPoints([0.2, 0]));
    expect(steps).toHaveLength(2);
    expect(steps[0].endMs).toBe(NOW);
    expect(steps[0].endMs - steps[0].startMs).toBe(HOURLY_STEP_MIN * MIN);
    expect(steps[0].endMs).toBe(steps[1].startMs);
  });
});

describe('computeRainStart', () => {
  it('returns null when no series has usable windows', () => {
    expect(computeRainStart({ now: NOW })).toBeNull();
    expect(computeRainStart({ now: NOW, minutely: [] })).toBeNull();
    // All windows already closed → history only → null.
    const past = nowcastSeries([1.0], NOW - 30 * MIN);
    expect(computeRainStart({ now: NOW, nowcast: past })).toBeNull();
  });

  it('detects rain expected later and reports minutes until it starts', () => {
    const forecast = computeRainStart({
      now: NOW,
      minutely: seriesFromMinutely(minutelyPoints([0, 0, RAIN_THRESHOLD_MM + 0.1, 0])),
    });
    expect(forecast).not.toBeNull();
    expect(forecast!.status).toBe('rain-expected');
    expect(forecast!.source).toBe('open-meteo');
    // The wet window ends at NOW+30, so it opens 15 min after now.
    expect(forecast!.startsInMinutes).toBe(15);
    expect(forecast!.peakMm).toBe(RAIN_THRESHOLD_MM + 0.1);
  });

  it('treats sub-threshold trace amounts as dry', () => {
    const forecast = computeRainStart({
      now: NOW,
      minutely: seriesFromMinutely(minutelyPoints([0, RAIN_THRESHOLD_MM / 2, 0, 0])),
    });
    expect(forecast!.status).toBe('no-rain');
  });

  it('keeps a 0.15 mm window dry — the floor is 0.2 mm', () => {
    // Pins the raised floor: under the old 0.1 mm cutoff this window was wet
    // and announced rain that never materialized.
    const forecast = computeRainStart({
      now: NOW,
      minutely: seriesFromMinutely(minutelyPoints([0, 0.15, 0, 0])),
    });
    expect(forecast!.status).toBe('no-rain');
  });

  it('pins the minimum rain threshold at 0.2 mm', () => {
    expect(RAIN_THRESHOLD_MM).toBe(0.2);
  });

  it('detects raining-now when the current window is wet and finds the end', () => {
    // The fixture's first window ends at NOW (spanning (NOW−15, NOW]), so
    // the second window covers (NOW, NOW+15] — wet → raining now, easing
    // when the dry window opens at NOW+15.
    const forecast = computeRainStart({
      now: NOW,
      minutely: seriesFromMinutely(minutelyPoints([0, RAIN_THRESHOLD_MM + 0.5, 0, 0])),
    });
    expect(forecast!.status).toBe('raining-now');
    expect(forecast!.endsAt).toBe(NOW + MINUTELY_STEP_MIN * MIN);
    expect(forecast!.endsInMinutes).toBe(15);
    expect(forecast!.peakMm).toBe(RAIN_THRESHOLD_MM + 0.5);
  });

  it('leaves endsAt undefined when the wet run reaches the end of the series', () => {
    const forecast = computeRainStart({
      now: NOW,
      minutely: seriesFromMinutely(minutelyPoints([RAIN_THRESHOLD_MM, RAIN_THRESHOLD_MM, RAIN_THRESHOLD_MM])),
    });
    expect(forecast!.status).toBe('raining-now');
    expect(forecast!.endsAt).toBeUndefined();
  });

  it('prefers the HKO grid on shared slots and credits it as the source', () => {
    // Grid windows end at NOW+30/60/90 min (the first straddles `now`, dry).
    // The minutely series stays dry until its window starting at NOW+30 —
    // the same slot the grid's wet window opens on — so the grid value must
    // win the shared slot and the verdict must read 'hko-grid'.
    const grid = nowcastSeries([0, RAIN_THRESHOLD_MM + 0.2, RAIN_THRESHOLD_MM + 0.2], NOW + 30 * MIN);
    const forecast = computeRainStart({
      now: NOW,
      nowcast: grid,
      minutely: seriesFromMinutely(minutelyPoints([
        0, 0, 0, RAIN_THRESHOLD_MM + 0.1, RAIN_THRESHOLD_MM + 0.1,
      ])),
    });
    expect(forecast!.status).toBe('rain-expected');
    expect(forecast!.source).toBe('hko-grid');
    // First wet window opens at NOW+30 (grid window 1; grid window 0 is dry).
    expect(forecast!.startsInMinutes).toBe(30);
    expect(forecast!.peakMm).toBeCloseTo(RAIN_THRESHOLD_MM + 0.2, 10);
  });

  it('falls back to open-meteo source when rain starts beyond the nowcast window', () => {
    const grid = nowcastSeries([0, 0, 0], NOW + 30 * MIN);
    const forecast = computeRainStart({
      now: NOW,
      nowcast: grid,
      minutely: seriesFromMinutely(minutelyPoints([0, 0, 0, 0, 0, 0, 0, RAIN_THRESHOLD_MM + 0.4])),
    });
    expect(forecast!.status).toBe('rain-expected');
    expect(forecast!.source).toBe('open-meteo');
  });

  it('uses hourly as the fallback series when minutely is missing', () => {
    // Stamps NOW/NOW+1h/NOW+2h → windows (NOW−1h, NOW] (closed, dropped),
    // (NOW, NOW+1h] dry, (NOW+1h, NOW+2h] wet → the wet bucket opens at
    // NOW+60 under the preceding-hour convention.
    const forecast = computeRainStart({
      now: NOW,
      hourly: seriesFromHourly(hourlyPoints([0, 0, RAIN_THRESHOLD_MM + 0.3])),
    });
    expect(forecast!.status).toBe('rain-expected');
    expect(forecast!.source).toBe('open-meteo');
    expect(forecast!.startsInMinutes).toBe(HOURLY_STEP_MIN);
    expect(forecast!.horizonMinutes).toBeGreaterThanOrEqual(60);
  });

  it('reports the grid extent as the horizon when the grid is all we have', () => {
    const grid = nowcastSeries([0, 0, 0], NOW + 30 * MIN);
    const forecast = computeRainStart({ now: NOW, nowcast: grid });
    expect(forecast!.status).toBe('no-rain');
    expect(forecast!.source).toBe('hko-grid');
    // Coverage: last window ends at NOW + 90 min.
    expect(forecast!.horizonMinutes).toBe(90);
  });

  it('caps the merged series at MAX_SERIES_STEPS windows', () => {
    const many: RainStep[] = Array.from({ length: 200 }, (_, i) => ({
      startMs: NOW + i * MINUTELY_STEP_MIN * MIN,
      endMs: NOW + (i + 1) * MINUTELY_STEP_MIN * MIN,
      mm: 0,
    }));
    const forecast = computeRainStart({ now: NOW, minutely: many });
    expect(forecast!.series.length).toBe(MAX_SERIES_STEPS);
  });

  it('returns null when the horizon filter drops every merged window', () => {
    // A window 90–120 min out survives the history filter but starts beyond
    // a 60-min horizon — the merge must bail instead of crashing on the
    // empty tail.
    const later = nowcastSeries([0], NOW + 120 * MIN);
    expect(computeRainStart({ now: NOW, nowcast: later, horizonMinutes: 60 })).toBeNull();
  });
});
