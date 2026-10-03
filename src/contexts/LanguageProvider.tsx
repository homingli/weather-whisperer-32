import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { STORAGE_KEYS } from '@/lib/constants';
import { HTML_LANG, VALID_LANGUAGES, translations, type Language } from './translations';
import { LanguageContext } from './language-context';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    let initial: Language = 'en';
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEYS.LANGUAGE) as Language | null;
      // Validate against the set of supported languages so a tampered
      // localStorage value (e.g. 'fr') doesn't leak into <html lang> or the
      // translations[] lookup. Mirrors the pattern in UnitsContext.tsx.
      if (raw && VALID_LANGUAGES.has(raw)) initial = raw;
    }
    // WCAG 3.1.1 — set <html lang> synchronously before the first paint so
    // screen readers never see a flash of 'en' on a Chinese-filled page.
    // Mutating document.documentElement is a non-React side effect and is
    // idempotent; the useEffect below handles subsequent changes.
    if (typeof document !== 'undefined') {
      document.documentElement.lang = HTML_LANG[initial];
    }
    return initial;
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEYS.LANGUAGE, lang);
  }, []);

  // Keep <html lang> in sync with later language changes (covers the
  // setLanguage call above). The first paint is handled by the useState
  // initializer above.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = HTML_LANG[language];
  }, [language]);

  const t = useCallback((key: string, fallback?: string): string => {
    return translations[language][key] || fallback || key;
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}
