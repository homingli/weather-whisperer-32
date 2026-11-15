import { createContext, useContext } from 'react';

export type ThemeMode = 'light' | 'dark' | 'auto';
export type ResolvedTheme = 'light' | 'dark';

/**
 * Location the sun-synced auto theme evaluates day/night for. Coordinates
 * come from the selected city; sunrise/sunset are computed locally per tick
 * (solar-times.ts) — never from the weather payload, so auto theme works
 * when Open-Meteo is unavailable.
 */
export interface SunLocation {
  latitude: number;
  longitude: number;
  /** IANA zone from the weather payload; device zone is used when absent. */
  timezone?: string;
}

interface ThemeContextType {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  resolvedTheme: ResolvedTheme;
  setSunLocation: (location: SunLocation | null) => void;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
