import { createContext } from 'react';
import type { Language } from './translations';

export interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, fallback?: string) => string;
}

/**
 * The context object lives in its own component-free module so the
 * error boundaries in RainfallMap/MSCRainfallMap can use
 * `LanguageContext.Consumer` (hooks are unavailable in class render)
 * while LanguageProvider stays the module's only component export.
 */
export const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);
