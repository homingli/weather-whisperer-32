import { createContext, useContext } from 'react';
import type { Units } from '@/lib/units';

export type { Units };

interface UnitsContextType {
  units: Units;
  setUnits: (next: Units) => void;
}

export const UnitsContext = createContext<UnitsContextType | undefined>(undefined);

export function useUnits() {
  const context = useContext(UnitsContext);
  if (context === undefined) {
    throw new Error('useUnits must be used within a UnitsProvider');
  }
  return context;
}