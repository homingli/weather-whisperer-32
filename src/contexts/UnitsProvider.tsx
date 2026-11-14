import { useMemo, type ReactNode } from 'react';
import { STORAGE_KEYS } from '@/lib/constants';
import { usePersistedEnum } from '@/hooks/usePersistedEnum';
import { UnitsContext, type Units } from './UnitsContext';

const VALID: ReadonlySet<Units> = new Set<Units>(['metric', 'us']);

export function UnitsProvider({ children }: { children: ReactNode }) {
  const [units, setUnits] = usePersistedEnum(STORAGE_KEYS.UNITS, VALID, 'metric');

  const value = useMemo(() => ({ units, setUnits }), [units, setUnits]);

  return (
    <UnitsContext.Provider value={value}>
      {children}
    </UnitsContext.Provider>
  );
}
