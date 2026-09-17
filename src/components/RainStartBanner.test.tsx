// Tests for the rain-start banner strip: verdict copy, the city-wide
// qualifier, the screen-reader live region (which must NOT carry the
// per-minute countdown), and the renders-nothing degradation path.
//
// Fake timers pin `now` so the fixtures' relative offsets stay exact.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainStartBanner } from './RainStartBanner';
import { LanguageProvider } from '@/contexts/LanguageContext';
import type { WeatherData, MinutelyPrecipitation } from '@/lib/weather';

const NOW = Date.UTC(2026, 8, 17, 8, 0); // 2026-09-17 08:00 UTC
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

function renderBanner(weather: WeatherData) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
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

describe('RainStartBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the rain-expected verdict with countdown and city-wide qualifier', () => {
    // Stamps N+15…N+60 → the wet window is (N+30, N+45], so rain is
    // expected at 08:30 (its start), in ~30 min.
    renderBanner({ ...baseWeather, minutely: minutely([0, 0, 0.5, 0]) });
    const live = screen.getByRole('status');
    expect(live.textContent).toMatch(/Rain expected around 08:30/);
    // Live region must stay stable across minute ticks: no countdown clause.
    expect(live.textContent).not.toMatch(/min/);
    expect(live.textContent).toMatch(/city-wide forecast/);
    // Visible text carries the countdown and the qualifier kicker.
    expect(document.body.textContent).toMatch(/in ~30 min/);
    expect(document.body.textContent).toMatch(/Rain expected around 08:30/);
  });

  it('renders raining-now copy when the straddling window is wet', () => {
    // First stamp N+15 covers (N, N+15] — startMs lands exactly on NOW, so
    // the wet window straddles "now": raining, easing when the following
    // dry window opens at N+15 (08:15).
    renderBanner({ ...baseWeather, minutely: minutely([0.5, 0, 0]) });
    expect(screen.getByRole('status').textContent).toMatch(/Raining now/);
    expect(document.body.textContent).toMatch(/easing around 08:15/);
  });

  it('renders the no-rain verdict from the minutely horizon', () => {
    renderBanner({ ...baseWeather, minutely: minutely([0, 0, 0, 0]) });
    expect(screen.getByRole('status').textContent).toMatch(/No rain expected in the next 1 h/);
  });

  it('renders nothing when no series is usable', () => {
    const { container } = renderBanner({ ...baseWeather, minutely: undefined });
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.textContent).toBe('');
  });
});
