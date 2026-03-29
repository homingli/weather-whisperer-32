import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';

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

  // Determine resolved theme based on mode and sun times
  useEffect(() => {
    const updateResolvedTheme = () => {
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
        if (sunTimes.sunrise && sunTimes.sunset) {
          const now = new Date();
          const currentTime = now.getTime();
          const sunriseTime = sunTimes.sunrise.getTime();
          const sunsetTime = sunTimes.sunset.getTime();
          
          // It's day if current time is after sunrise and before sunset
          const isDay = currentTime >= sunriseTime && currentTime < sunsetTime;
          setResolvedTheme(isDay ? 'light' : 'dark');
        } else {
          // Fallback to system preference
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          setResolvedTheme(prefersDark ? 'dark' : 'light');
        }
      }
    };

    updateResolvedTheme();
    
    // Update every 5 minutes for auto mode
    const interval = setInterval(updateResolvedTheme, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [mode, sunTimes]);

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
