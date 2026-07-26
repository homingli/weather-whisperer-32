import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { STORAGE_KEYS } from '@/lib/constants';
import type { Units } from '@/lib/units';

export type { Units };

interface UnitsContextType {
  units: Units;
  setUnits: (next: Units) => void;
}

const VALID: ReadonlySet<Units> = new Set<Units>(['metric', 'us']);

const UnitsContext = createContext<UnitsContextType | undefined>(undefined);

export function UnitsProvider({ children }: { children: ReactNode }) {
  const [units, setUnitsState] = useState<Units>(() => {
    if (typeof window === 'undefined') return 'metric';
    const raw = localStorage.getItem(STORAGE_KEYS.UNITS) as Units | null;
    return raw && VALID.has(raw) ? raw : 'metric';
  });

  const setUnits = useCallback((next: Units) => {
    setUnitsState(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.UNITS, next);
    }
  }, []);

  const value = useMemo(() => ({ units, setUnits }), [units, setUnits]);

  return (
    <UnitsContext.Provider value={value}>
      {children}
    </UnitsContext.Provider>
  );
}

export function useUnits() {
  const context = useContext(UnitsContext);
  if (context === undefined) {
    throw new Error('useUnits must be used within a UnitsProvider');
  }
  return context;
}