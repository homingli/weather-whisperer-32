import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';

type ThemeValue = ReturnType<typeof useTheme>;

// Captures the latest theme context value on each render. Read from outside
// after wrapping state changes in act() to assert post-commit values.
let latestTheme: ThemeValue | null = null;
function ThemeProbe() {
  latestTheme = useTheme();
  return null;
}
function readTheme(): ThemeValue {
  if (!latestTheme) throw new Error('ThemeProbe never rendered');
  return latestTheme;
}

// Two distinct sun-times windows on consecutive days, used by tests that need
// to simulate a weather refresh (setSunTimes bails out via an internal
// equality check when the timestamps haven't changed, so re-issuing the same
// Dates is a no-op).
const day15 = {
  sunrise: new Date('2024-06-15T06:00:00Z'),
  sunset: new Date('2024-06-15T18:00:00Z'),
};
const day16 = {
  sunrise: new Date('2024-06-16T06:01:00Z'),
  sunset: new Date('2024-06-16T18:01:00Z'),
};

describe('ThemeContext auto mode + sunTimes', () => {
  beforeEach(() => {
    localStorage.clear();
    latestTheme = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves to light when current time is between sunrise and sunset', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z')); // noon

    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);

    act(() => readTheme().setMode('auto'));
    act(() => readTheme().setSunTimes(day15.sunrise, day15.sunset));

    expect(readTheme().resolvedTheme).toBe('light');
  });

  it('resolves to dark when current time is before sunrise', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T03:00:00Z')); // 3am

    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);

    act(() => readTheme().setMode('auto'));
    act(() => readTheme().setSunTimes(day15.sunrise, day15.sunset));

    expect(readTheme().resolvedTheme).toBe('dark');
  });

  it('resolves to dark when current time is after sunset', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T21:00:00Z')); // 9pm

    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);

    act(() => readTheme().setMode('auto'));
    act(() => readTheme().setSunTimes(day15.sunrise, day15.sunset));

    expect(readTheme().resolvedTheme).toBe('dark');
  });

  it('falls back to system preference (matchMedia) when sunTimes not yet loaded', () => {
    // matchMedia mock in test setup returns matches: false (light)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));

    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);

    act(() => readTheme().setMode('auto'));

    expect(readTheme().resolvedTheme).toBe('light');
  });

  it('explicit light mode stays light even at night', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T03:00:00Z'));

    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);

    act(() => readTheme().setMode('light'));
    act(() => readTheme().setSunTimes(day15.sunrise, day15.sunset));

    expect(readTheme().resolvedTheme).toBe('light');
  });

  it('explicit dark mode stays dark even at mid-day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));

    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);

    act(() => readTheme().setMode('dark'));
    act(() => readTheme().setSunTimes(day15.sunrise, day15.sunset));

    expect(readTheme().resolvedTheme).toBe('dark');
  });

  // Regression: the previous bug was that moving sunTimes behind a stable ref
  // also dropped the immediate re-eval of resolvedTheme. setSunTimes had no
  // observable effect until the 5-min interval tick (up to 5 minutes late),
  // so on initial weather load the theme stayed on system preference.
  it('regression: setSunTimes re-evaluates resolvedTheme immediately', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T03:00:00Z')); // 3am

    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);

    act(() => readTheme().setMode('auto'));
    // No sunTimes -> falls back to matchMedia (light in test env)
    expect(readTheme().resolvedTheme).toBe('light');

    // SunTimes arrive for a day window. Without advancing the interval, the
    // theme must flip to dark immediately because 3am is before sunrise.
    act(() => readTheme().setSunTimes(day15.sunrise, day15.sunset));
    expect(readTheme().resolvedTheme).toBe('dark');

    // Refresh: sunTimes arrive for the next day (timestamps shifted so the
    // internal equality check in setSunTimes doesn't bail out). System clock
    // is also at noon now. Theme must flip to light immediately, not wait
    // for the 5-min interval tick.
    vi.setSystemTime(new Date('2024-06-16T12:00:00Z'));
    act(() => readTheme().setSunTimes(day16.sunrise, day16.sunset));
    expect(readTheme().resolvedTheme).toBe('light');
  });

  // The 5-min interval covers the case where the clock crosses sunrise/sunset
  // while the page is open with no setSunTimes activity.
  it('5-min interval re-evaluates theme when clock crosses sunrise', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T05:59:00Z')); // 1 min before sunrise

    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);

    act(() => readTheme().setMode('auto'));
    act(() => readTheme().setSunTimes(day15.sunrise, day15.sunset));
    expect(readTheme().resolvedTheme).toBe('dark');

    // Cross sunrise and advance past the next interval tick.
    vi.setSystemTime(new Date('2024-06-15T06:01:00Z'));
    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });
    expect(readTheme().resolvedTheme).toBe('light');
  });
});