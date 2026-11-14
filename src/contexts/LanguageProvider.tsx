import { useCallback, useMemo, type ReactNode } from 'react';
import { STORAGE_KEYS } from '@/lib/constants';
import { usePersistedEnum } from '@/hooks/usePersistedEnum';
import { HTML_LANG, VALID_LANGUAGES, translations, type Language } from './translations';
import { LanguageContext } from './language-context';

/** WCAG 3.1.1 — keep <html lang> aligned with the persisted language. Runs
 *  synchronously in the initializer (before first paint, so screen readers
 *  never see a flash of 'en' on a Chinese-filled page) and on every set.
 *  Mutating documentElement is a non-React side effect and is idempotent. */
function applyHtmlLang(lang: Language) {
  document.documentElement.lang = HTML_LANG[lang];
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = usePersistedEnum(
    STORAGE_KEYS.LANGUAGE,
    VALID_LANGUAGES,
    'en',
    applyHtmlLang,
  );

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
