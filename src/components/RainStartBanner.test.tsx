// Tests for the rain-start banner strip: verdict copy, the city-scale
// qualifier (which leads the strip), the sparkline span label, the
// screen-reader live region (which must NOT carry the per-minute
// countdown), the 6-hour verdict horizon, and the hide-strip paths
// (no-rain verdict, no usable series). A second block seeds the query
// cache with the auto-loaded district crop (nowcastLocal) to cover the
// district-authority merge: the grid outranks Open-Meteo inside its
// covered span, including the all-dry crop case.
//
// Fake timers pin `now` so the fixtures' relative offsets stay exact.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LanguageProvider } from '@/contexts/LanguageProvider';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainStartBanner } from './RainStartBanner';
import { localNowcastQueryKey, type LocalRainNowcast } from '@/lib/nowcastLocal';
import { buildRainGrid, type CellRow, type RainGrid } from '@/lib/rainfallGrid';

import type { WeatherData, MinutelyPrecipitation } from '@/lib/weather';

const NOW = Date.UTC(2026, 8, 17, 8, 0); // 2026-09-17 08:00 UTC (16:00 HKT)
const MIN = 60_000;

function minutely(values: number[]): MinutelyPrecipitation[] {
  return values.map((precipitation, i) => ({
    // Interval-END stamps (value = preceding-15-min sum): first stamp sits
    // 15 min after NOW so every window is in the future.
    time: new Date(NOW + (i + 1) * 15 * MIN),
    precipitation,
  }));
}

const baseWeather: WeatherData = {
  headline: { source: 'om' },
  current: {
    temperature: 20,
    apparentTemperature: 18,
    humidity: 60,
    uvIndex: 5,
    weatherCode: 0,
    windSpeed: 25,
    windDirection: 180,
    precipitation: 0,
    precipitationProbability: 0,
    isDay: true,
  },
  hourly: [],
  daily: [],
  timezone: 'UTC',
};

function renderBanner(weather: WeatherData, seeds: { local?: LocalRainNowcast; full?: { grid: RainGrid } } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (seeds.local) client.setQueryData(localNowcastQueryKey(22.3, 114.2), seeds.local);
  if (seeds.full) client.setQueryData(['hkoGriddedRainfallNowcast'], seeds.full);
  return render(
    <QueryClientProvider client={client}>
      <LanguageProvider>
        <RainStartBanner
          weather={weather}
          latitude={22.3}
          longitude={114.2}
        />
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

/** HK-local raw step stamps: 16:30 HKT = 08:30 UTC, etc. */
const STEP_1630 = '202609171630'; // covers (08:00, 08:30] UTC
const STEP_1700 = '202609171700'; // covers (08:30, 09:00] UTC
const STEP_1730 = '202609171730'; // covers (09:00, 09:30] UTC

/** Build a crop grid from [lat, lon, stepStamp, value] rows. Steps exist only
 *  where some cell is wet — same as the real cropped CSV. */
function makeGrid(rows: Array<[number, number, string, number]>): RainGrid | null {
  const cellRows: CellRow[] = rows.map(([lat, lon, endTime, value]) => ({
    lat, lon, endTime, value,
  }));
  return buildRainGrid(cellRows);
}

const dryCrop: LocalRainNowcast = {
  grid: null,
  updateTime: '',
  coverageEndRaw: STEP_1730,
  coverageEndMs: Date.UTC(2026, 8, 17, 9, 30),
};

/** A header-less 200 (dev serves the TS module for /api/nowcast; a garbage
 *  upstream body hits the same path in prod): zero rows parsed, no coverage
 *  evidence — must grant the crop NO district authority. */
const evidenceFree: LocalRainNowcast = {
  grid: null,
  updateTime: '',
  coverageEndRaw: '',
  coverageEndMs: null,
};

describe('RainStartBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the rain-expected verdict with countdown, qualifier and span label', () => {
    // Stamps N+15…N+60 → the wet window is (N+30, N+45], so rain is
    // expected at 08:30 (its start), in ~30 min.
    renderBanner({ ...baseWeather, minutely: minutely([0, 0, 0.5, 0]) });
    const live = screen.getByRole('status');
    expect(live.textContent).toMatch(/Rain expected around 08:30/);
    // Live region must stay stable across minute ticks: no countdown clause.
    expect(live.textContent).not.toMatch(/min/);
    expect(live.textContent).toMatch(/city-scale forecast/);
    // The qualifier leads the strip: first visible child, before the verdict.
    const strip = live.parentElement!;
    expect(strip.firstElementChild!.textContent).toBe('city-scale forecast');
    // Visible text carries the countdown, the qualifier and the sparkline's
    // 6-hour span label.
    expect(document.body.textContent).toMatch(/in ~30 min/);
    expect(document.body.textContent).toMatch(/Rain expected around 08:30/);
    expect(document.body.textContent).toMatch(/next 6 h/);
  });

  it('renders raining-now copy when the straddling window is wet', () => {
    // First stamp N+15 covers (N, N+15] — startMs lands exactly on NOW, so
    // the wet window straddles "now": raining, easing when the following
    // dry window opens at N+15 (08:15).
    renderBanner({ ...baseWeather, minutely: minutely([0.5, 0, 0]) });
    expect(screen.getByRole('status').textContent).toMatch(/Raining now/);
    expect(document.body.textContent).toMatch(/easing around 08:15/);
  });

  it('renders nothing when no rain is expected', () => {
    const { container } = renderBanner({ ...baseWeather, minutely: minutely([0, 0, 0, 0]) });
    // A no-rain verdict hides the strip entirely — the at-a-glance row
    // carries the all-clear.
    expect(container.textContent).toBe('');
  });

  it('renders nothing when a wet window sits beyond the 6-hour verdict horizon', () => {
    // 96 stamps reaching N+24 h with a wet window 23 h out. The old 24 h
    // horizon announced "rain expected" for it over an all-dry sparkline;
    // the window is now outside the verdict horizon, so the strip hides.
    const values = Array<number>(96).fill(0);
    values[91] = 0.5; // window (N+22 h 45, N+23 h]
    const { container } = renderBanner({ ...baseWeather, minutely: minutely(values) });
    expect(container.textContent).toBe('');
  });

  it('hides the span label when the series is too short for a sparkline', () => {
    // Single wet window straddling "now" → raining-now with one bar;
    // Sparkline needs ≥ 2 bars, and the "next 6 h" caption must not render
    // orphaned next to nothing.
    renderBanner({ ...baseWeather, minutely: minutely([0.5]) });
    const kickers = Array.from(document.querySelectorAll('.kicker')).map((k) => k.textContent);
    expect(kickers).not.toContain('next 6 h');
    // Verdict still renders.
    expect(screen.getByRole('status').textContent).toMatch(/Raining now/);
  });

  it('renders nothing when no series is usable', () => {
    const { container } = renderBanner({ ...baseWeather, minutely: undefined });
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.textContent).toBe('');
  });
});

describe('RainStartBanner district authority (auto-loaded crop)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('attributes a grid-backed verdict to the district, not city-scale', () => {
    // Grid: user's cell wet over (08:00, 08:30]; a neighbor cell wet over
    // (08:30, 09:00] so the sampled series is [1.0, 0] → raining now,
    // easing 08:30. OM also claims a wet :15 bucket — the grid wins the
    // leading window, so no city-scale qualifier may appear.
    const grid = makeGrid([
      [22.3, 114.2, STEP_1630, 1.0],
      [22.35, 114.25, STEP_1700, 2.0],
    ])!;
    renderBanner({ ...baseWeather, minutely: minutely([0.5, 0, 0]) }, { local: {
      grid, updateTime: '', coverageEndRaw: STEP_1730, coverageEndMs: Date.UTC(2026, 8, 17, 9, 30),
    } });
    expect(screen.getByRole('status').textContent).toMatch(/Raining now/);
    expect(screen.getByRole('status').textContent).not.toMatch(/city-scale/);
    expect(document.body.textContent).not.toMatch(/city-scale forecast/);
  });

  it('suppresses Open-Meteo rain inside an all-dry crop\u2019s coverage span', () => {
    // The complaint case: OM's ~8 km cell says raining now, the district
    // observation says dry. A valid all-dry crop is authority until 09:30,
    // so the wet (08:00, 08:15] OM window drops and the strip hides.
    const { container } = renderBanner(
      { ...baseWeather, minutely: minutely([0.5, 0, 0]) },
      { local: dryCrop },
    );
    expect(container.textContent).toBe('');
  });

  it('grants no authority to an evidence-free crop response', () => {
    // Header-less 200 (dev /api/nowcast serves the TS module; garbage
    // upstream body in prod): zero rows, no coverage — Open-Meteo must stay
    // unfiltered instead of being suppressed on no data.
    renderBanner({ ...baseWeather, minutely: minutely([0.5, 0, 0]) }, { local: evidenceFree });
    expect(screen.getByRole('status').textContent).toMatch(/Raining now/);
    expect(screen.getByRole('status').textContent).toMatch(/city-scale/);
  });

  it('derives the authority span from a wet crop grid when the header is missing', () => {
    // Degenerate server response: wet crop, no coverage header. The grid's
    // own steps are evidence — its horizon bounds OM suppression.
    const grid = makeGrid([[22.3, 114.2, STEP_1630, 1.0]])!;
    renderBanner({ ...baseWeather, minutely: minutely([0.5, 0, 0]) }, { local: {
      grid, updateTime: '', coverageEndRaw: '', coverageEndMs: null,
    } });
    expect(screen.getByRole('status').textContent).toMatch(/Raining now/);
    expect(screen.getByRole('status').textContent).not.toMatch(/city-scale/);
  });

  it('lets the full map grid serve when the crop entry is evidence-free', () => {
    // Dev/garbage crop entry + a real map-opened grid: treated as absent,
    // the map grid supplies district windows (its horizon bounds OM).
    const fullGrid = makeGrid([[22.3, 114.2, STEP_1630, 1.0]])!;
    renderBanner(
      { ...baseWeather, minutely: minutely([0.5, 0, 0]) },
      { local: evidenceFree, full: { grid: fullGrid } },
    );
    expect(screen.getByRole('status').textContent).toMatch(/Raining now/);
    expect(screen.getByRole('status').textContent).not.toMatch(/city-scale/);
  });

  it('prefers a dry crop over an older-vintage wet map grid', () => {
    // Crop entry present + grid null (all-dry now) vs a wet FULL map grid
    // from an earlier vintage: the fresher district observation wins — the
    // stale grid must not resurrect "raining now", and OM stays suppressed
    // inside the crop's span.
    const staleWetGrid = makeGrid([[22.3, 114.2, STEP_1630, 1.0]])!;
    const { container } = renderBanner(
      { ...baseWeather, minutely: minutely([0.5, 0, 0]) },
      { local: dryCrop, full: { grid: staleWetGrid } },
    );
    expect(container.textContent).toBe('');
  });

  it('lets a wet grid window override earlier city-scale rain inside the span', () => {
    // OM says rain in 15 min; the grid says rain starts (09:00, 09:30] —
    // district timing wins, verdict is grid-backed (no city-scale kicker).
    const grid = makeGrid([[22.3, 114.2, STEP_1730, 1.0]])!;
    renderBanner({ ...baseWeather, minutely: minutely([0.5, 0, 0, 0, 0, 0]) }, { local: {
      grid, updateTime: '', coverageEndRaw: STEP_1730, coverageEndMs: Date.UTC(2026, 8, 17, 9, 30),
    } });
    const live = screen.getByRole('status');
    expect(live.textContent).toMatch(/Rain expected around 09:00/);
    expect(live.textContent).not.toMatch(/city-scale/);
  });

  it('falls back to the full map grid when no crop entry exists', () => {
    // Map-opened user, no auto-load data yet: the full-domain grid supplies
    // the district windows (last step = coverage end for the OM filter).
    const grid = makeGrid([[22.3, 114.2, STEP_1630, 1.0]])!;
    renderBanner({ ...baseWeather, minutely: minutely([0.5, 0, 0]) }, { full: { grid } });
    expect(screen.getByRole('status').textContent).toMatch(/Raining now/);
    expect(screen.getByRole('status').textContent).not.toMatch(/city-scale/);
  });

  it('keeps Open-Meteo rain beyond the coverage span as city-scale', () => {
    // All-dry crop until 09:30, but OM has a wet window (09:45, 10:00] —
    // outside the grid's horizon, so it survives with its qualifier.
    const values = Array<number>(8).fill(0);
    values[7] = 0.5; // end NOW + 120 min → (09:45, 10:00]
    renderBanner({ ...baseWeather, minutely: minutely(values) }, { local: dryCrop });
    const live = screen.getByRole('status');
    expect(live.textContent).toMatch(/Rain expected around 09:45/);
    expect(live.textContent).toMatch(/city-scale/);
  });
});
