import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ThemeProvider } from '@/contexts/ThemeProvider';
import { render, act } from '@testing-library/react';
import { useTheme, type SunLocation } from '@/contexts/ThemeContext';
import { TIMING } from '@/lib/constants';

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

// Auto mode now computes sunrise/sunset from the pushed location (solar-times),
// so tests use a location whose sun window is known and wide: the equator at
// longitude 0 in UTC. Around 2026-06-15 the sun window is ≈05:56Z–18:02Z, and
// the equation of time can only shift it ±16 min across the year, so the probe
// times below stay unambiguous.
const EQUATOR: SunLocation = { latitude: 0, longitude: 0, timezone: 'UTC' };
// Polar night: no sun events → auto mode must fall back to system preference.
const TROMSO_WINTER: SunLocation = { latitude: 69.649, longitude: 18.955, timezone: 'Europe/Oslo' };

describe('ThemeContext auto mode + sun location', () => {
  beforeEach(() => {
    localStorage.clear();
    latestTheme = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves to light when current time is between sunrise and sunset', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z')); // noon

    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);

    act(() => readTheme().setMode('auto'));
    act(() => readTheme().setSunLocation(EQUATOR));

    expect(readTheme().resolvedTheme).toBe('light');
  });

  it('resolves to dark when current time is before sunrise', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T03:00:00Z')); // 3am

    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);

    act(() => readTheme().setMode('auto'));
    act(() => readTheme().setSunLocation(EQUATOR));

    expect(readTheme().resolvedTheme).toBe('dark');
  });

  it('resolves to dark when current time is after sunset', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T21:00:00Z')); // 9pm

    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);

    act(() => readTheme().setMode('auto'));
    act(() => readTheme().setSunLocation(EQUATOR));

    expect(readTheme().resolvedTheme).toBe('dark');
  });

  it('falls back to system preference (matchMedia) when no location is set', () => {
    // matchMedia mock in test setup returns matches: false (light)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));

    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);

    act(() => readTheme().setMode('auto'));

    expect(readTheme().resolvedTheme).toBe('light');
  });

  it('falls back to system preference in polar night (no sun events)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-21T12:00:00Z')); // Tromsø polar night

    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);

    act(() => readTheme().setMode('auto'));
    act(() => readTheme().setSunLocation(TROMSO_WINTER));

    // matchMedia mock: light
    expect(readTheme().resolvedTheme).toBe('light');
  });

  it('explicit light mode stays light even at night', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T03:00:00Z'));

    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);

    act(() => readTheme().setMode('light'));
    act(() => readTheme().setSunLocation(EQUATOR));

    expect(readTheme().resolvedTheme).toBe('light');
  });

  it('explicit dark mode stays dark even at mid-day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));

    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);

    act(() => readTheme().setMode('dark'));
    act(() => readTheme().setSunLocation(EQUATOR));

    expect(readTheme().resolvedTheme).toBe('dark');
  });

  // Regression: the previous bug was that moving sun data behind a stable ref
  // also dropped the immediate re-eval of resolvedTheme. Pushing a location
  // had no observable effect until the 5-min interval tick (up to 5 minutes
  // late), so on initial city selection the theme stayed on system preference.
  it('regression: setSunLocation re-evaluates resolvedTheme immediately', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T03:00:00Z')); // 3am

    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);

    act(() => readTheme().setMode('auto'));
    // No location -> falls back to matchMedia (light in test env)
    expect(readTheme().resolvedTheme).toBe('light');

    // Location arrives. Without advancing the interval, the theme must flip
    // to dark immediately because 3am is before sunrise.
    act(() => readTheme().setSunLocation(EQUATOR));
    expect(readTheme().resolvedTheme).toBe('dark');

    // The clock moves to noon (past sunset-side of the same day window) —
    // the theme must flip to light immediately on the next location push,
    // not wait for the 5-min interval tick.
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
    act(() => readTheme().setSunLocation(EQUATOR));
    expect(readTheme().resolvedTheme).toBe('light');
  });

  // The 5-min interval covers the case where the clock crosses sunrise/sunset
  // while the page is open with no setSunLocation activity.
  it('5-min interval re-evaluates theme when clock crosses sunrise', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T05:30:00Z')); // ~25 min before sunrise

    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);

    act(() => readTheme().setMode('auto'));
    act(() => readTheme().setSunLocation(EQUATOR));
    expect(readTheme().resolvedTheme).toBe('dark');

    // Cross sunrise and advance past the next interval tick.
    vi.setSystemTime(new Date('2026-06-15T06:30:00Z'));
    act(() => {
      vi.advanceTimersByTime(TIMING.THEME_AUTO_TICK_MS);
    });
    expect(readTheme().resolvedTheme).toBe('light');
  });
});
