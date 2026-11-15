import { useEffect, useRef, useState, useCallback, useMemo, type ReactNode } from 'react';
import { STORAGE_KEYS, TIMING } from '@/lib/constants';
import { usePersistedEnum } from '@/hooks/usePersistedEnum';
import { getSunTimes, getZoneOffsetMinutes } from '@/lib/solar-times';
import { ThemeContext, type ThemeMode, type ResolvedTheme, type SunLocation } from './ThemeContext';

const VALID_MODES: ReadonlySet<ThemeMode> = new Set<ThemeMode>(['auto', 'light', 'dark']);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = usePersistedEnum(STORAGE_KEYS.THEME_MODE, VALID_MODES, 'auto');

  // Location for auto-mode day/night evaluation. Pushed by Index whenever the
  // selected city or the payload timezone changes; null before any city is set.
  const [sunLocation, setSunLocationState] = useState<SunLocation | null>(null);

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');

  // No equality bail-out here (unlike the old setSunTimes): pushes happen
  // only when the selected city or payload timezone changes — rare — and a
  // re-push of an unchanged location must still re-evaluate the theme, since
  // the clock may have crossed sunrise/sunset since the last evaluation. A
  // fresh state object per push also defeats React's same-reference bail-out,
  // so the re-eval effect always runs.
  const setSunLocation = useCallback((location: SunLocation | null) => {
    setSunLocationState(() => (location ? { ...location } : null));
  }, []);

  // Determine resolved theme based on mode and the location's sun times.
  // useCallback gives this a stable identity so the useEffect below doesn't
  // re-subscribe its interval on every render. The interval is intended to
  // reset only when `mode` changes (e.g. user toggles auto/light/dark).
  const updateResolvedTheme = useCallback(() => {
    if (mode === 'light') {
      setResolvedTheme('light');
      return;
    }

    if (mode === 'dark') {
      setResolvedTheme('dark');
      return;
    }

    // Auto mode: day/night from the location's computed sunrise/sunset.
    // Falls back to system preference only when no city is selected (or the
    // location sits in polar day/night, where sun times don't exist).
    if (mode === 'auto') {
      const loc = sunLocationRef.current;
      if (loc) {
        const now = new Date();
        const tzOffset = getZoneOffsetMinutes(loc.timezone, now);
        const { sunrise, sunset } = getSunTimes(loc.latitude, loc.longitude, now, tzOffset);
        if (sunrise && sunset) {
          const isDay = now.getTime() >= sunrise.getTime() && now.getTime() < sunset.getTime();
          setResolvedTheme(isDay ? 'light' : 'dark');
          return;
        }
      }
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setResolvedTheme(prefersDark ? 'dark' : 'light');
    }
  }, [mode]);

  // Stable ref for the latest sunLocation so updateResolvedTheme can read it
  // without becoming a useCallback dep. Without this, every city change would
  // give updateResolvedTheme a new identity, which would cause the 5-min
  // interval below to be cleared and re-created on every refresh -- churning
  // the timer for no benefit.
  //
  // We also re-evaluate the theme here whenever the location changes so the
  // day/night switch takes effect immediately when the user picks a city,
  // not on the next 5-min interval tick.
  const sunLocationRef = useRef(sunLocation);
  useEffect(() => {
    sunLocationRef.current = sunLocation;
    updateResolvedTheme();
  }, [sunLocation, updateResolvedTheme]);

  // Recompute theme on mode/sun-time change, and tick every 5 minutes in auto mode.
  // Light/dark modes don't need the periodic tick.
  useEffect(() => {
    updateResolvedTheme();
    if (mode !== 'auto') return;
    const interval = setInterval(updateResolvedTheme, TIMING.THEME_AUTO_TICK_MS);
    return () => clearInterval(interval);
  }, [updateResolvedTheme, mode]);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [resolvedTheme]);

  const value = useMemo(() => ({
    mode, setMode, resolvedTheme, setSunLocation
  }), [mode, setMode, resolvedTheme, setSunLocation]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
