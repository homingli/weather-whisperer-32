import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';

type ThemeMode = 'light' | 'dark' | 'auto';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  resolvedTheme: ResolvedTheme;
  setSunTimes: (sunrise: Date | null, sunset: Date | null) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('theme-mode');
    return (saved as ThemeMode) || 'auto';
  });
  
  const [sunTimes, setSunTimesState] = useState<{ sunrise: Date | null; sunset: Date | null }>({
    sunrise: null,
    sunset: null,
  });
  
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    localStorage.setItem('theme-mode', newMode);
  }, []);

  const setSunTimes = useCallback((sunrise: Date | null, sunset: Date | null) => {
    setSunTimesState(prev => {
      const prevSunrise = prev.sunrise?.getTime();
      const prevSunset = prev.sunset?.getTime();
      const newSunrise = sunrise?.getTime();
      const newSunset = sunset?.getTime();
      
      if (prevSunrise === newSunrise && prevSunset === newSunset) {
        return prev;
      }
      return { sunrise, sunset };
    });
  }, []);

  // Stable ref for the latest sunTimes so updateResolvedTheme can read it without
// becoming a useCallback dep. Without this, every weather refresh would give
// sunTimes a new object reference, which would give updateResolvedTheme a new
// identity, which would cause the 5-min interval below to be cleared and
// re-created on every refresh -- churning the timer for no benefit.
const sunTimesRef = useRef(sunTimes);
useEffect(() => { sunTimesRef.current = sunTimes; }, [sunTimes]);

// Determine resolved theme based on mode and sun times.
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

  // Auto mode: use sunrise/sunset if available, otherwise use system preference
  if (mode === 'auto') {
    const currentSunTimes = sunTimesRef.current;
    if (currentSunTimes.sunrise && currentSunTimes.sunset) {
      const now = new Date();
      const currentTime = now.getTime();
      const sunriseTime = currentSunTimes.sunrise.getTime();
      const sunsetTime = currentSunTimes.sunset.getTime();

      // It's day if current time is after sunrise and before sunset
      const isDay = currentTime >= sunriseTime && currentTime < sunsetTime;
      setResolvedTheme(isDay ? 'light' : 'dark');
    } else {
      // Fallback to system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setResolvedTheme(prefersDark ? 'dark' : 'light');
    }
  }
}, [mode]);

  // Recompute theme on mode/sun-time change, and tick every 5 minutes in auto mode.
  // Light/dark modes don't need the periodic tick.
  useEffect(() => {
    updateResolvedTheme();
    if (mode !== 'auto') return;
    const interval = setInterval(updateResolvedTheme, 5 * 60 * 1000);
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
    mode, setMode, resolvedTheme, setSunTimes
  }), [mode, setMode, resolvedTheme, setSunTimes]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
