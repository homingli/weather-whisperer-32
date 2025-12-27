import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type WeatherSource = 'open-meteo' | 'hko';

interface WeatherSourceContextType {
  source: WeatherSource;
  setSource: (source: WeatherSource) => void;
  isHKO: boolean;
}

const WeatherSourceContext = createContext<WeatherSourceContextType | undefined>(undefined);

const STORAGE_KEY = 'weather-source';

export function WeatherSourceProvider({ children }: { children: ReactNode }) {
  const [source, setSourceState] = useState<WeatherSource>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored === 'hko' || stored === 'open-meteo') ? stored : 'open-meteo';
  });

  const setSource = (newSource: WeatherSource) => {
    setSourceState(newSource);
    localStorage.setItem(STORAGE_KEY, newSource);
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, source);
  }, [source]);

  return (
    <WeatherSourceContext.Provider value={{ source, setSource, isHKO: source === 'hko' }}>
      {children}
    </WeatherSourceContext.Provider>
  );
}

export function useWeatherSource() {
  const context = useContext(WeatherSourceContext);
  if (context === undefined) {
    throw new Error('useWeatherSource must be used within a WeatherSourceProvider');
  }
  return context;
}
