import { useState, useCallback, useMemo, type ReactNode } from 'react';
import { STORAGE_KEYS } from '@/lib/constants';
import { UnitsContext, type Units } from './UnitsContext';

const VALID: ReadonlySet<Units> = new Set<Units>(['metric', 'us']);

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
