import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { STORAGE_KEYS } from '@/lib/constants';

export type FontSize = 'small' | 'medium' | 'large';

interface FontSizeContextType {
  fontSize: FontSize;
  setFontSize: (next: FontSize) => void;
}

const VALID: ReadonlySet<FontSize> = new Set<FontSize>(['small', 'medium', 'large']);

/**
 * Root font-size per setting, expressed as a percentage of the browser's
 * default (so a user who raised their browser base font size keeps that
 * relative bump in every mode). Tailwind's spacing/typography scale is
 * rem-based, so scaling the root font-size rescales the whole layout —
 * text, padding, icons, tap targets — which is the point: on low-resolution
 * phones 'small' fits more content per screen, while 'large' reads better.
 * 'medium' removes the inline override entirely so the browser default
 * (the app's designed 16px look) applies.
 */
export const FONT_SIZE_ROOT_PERCENT: Record<FontSize, string> = {
  small: '87.5%',
  medium: '100%',
  large: '112.5%',
};

function applyRootFontSize(next: FontSize) {
  if (typeof document === 'undefined') return;
  if (next === 'medium') {
    document.documentElement.style.removeProperty('font-size');
  } else {
    document.documentElement.style.fontSize = FONT_SIZE_ROOT_PERCENT[next];
  }
}

const FontSizeContext = createContext<FontSizeContextType | undefined>(undefined);

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

export function useFontSize() {
  const context = useContext(FontSizeContext);
  if (context === undefined) {
    throw new Error('useFontSize must be used within a FontSizeProvider');
  }
  return context;
}
