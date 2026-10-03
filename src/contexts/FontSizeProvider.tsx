import { useState, useCallback, useMemo, type ReactNode } from 'react';
import { STORAGE_KEYS } from '@/lib/constants';
import { FontSizeContext, FONT_SIZE_ROOT_PERCENT, type FontSize } from './FontSizeContext';

const VALID: ReadonlySet<FontSize> = new Set<FontSize>(['small', 'medium', 'large']);

function applyRootFontSize(next: FontSize) {
  if (typeof document === 'undefined') return;
  if (next === 'medium') {
    document.documentElement.style.removeProperty('font-size');
  } else {
    document.documentElement.style.fontSize = FONT_SIZE_ROOT_PERCENT[next];
  }
}

export function FontSizeProvider({ children }: { children: ReactNode }) {
  const [fontSize, setFontSizeState] = useState<FontSize>(() => {
    if (typeof window === 'undefined') return 'medium';
    const raw = localStorage.getItem(STORAGE_KEYS.FONT_SIZE) as FontSize | null;
    const initial = raw && VALID.has(raw) ? raw : 'medium';
    // Apply synchronously in the initializer (before children render) so a
    // 'small'/'large' user never sees a flash of the default scale on
    // cold start. Mirrors the pattern in LanguageContext for <html lang>.
    applyRootFontSize(initial);
    return initial;
  });

  const setFontSize = useCallback((next: FontSize) => {
    setFontSizeState(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.FONT_SIZE, next);
    }
    applyRootFontSize(next);
  }, []);

  const value = useMemo(() => ({ fontSize, setFontSize }), [fontSize, setFontSize]);

  return (
    <FontSizeContext.Provider value={value}>
      {children}
    </FontSizeContext.Provider>
  );
}
