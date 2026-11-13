import { useMemo, type ReactNode } from 'react';
import { STORAGE_KEYS } from '@/lib/constants';
import { usePersistedEnum } from '@/hooks/usePersistedEnum';
import { FontSizeContext, FONT_SIZE_ROOT_PERCENT, type FontSize } from './FontSizeContext';

const VALID: ReadonlySet<FontSize> = new Set<FontSize>(['small', 'medium', 'large']);

function applyRootFontSize(next: FontSize) {
  if (next === 'medium') {
    document.documentElement.style.removeProperty('font-size');
  } else {
    document.documentElement.style.fontSize = FONT_SIZE_ROOT_PERCENT[next];
  }
}

export function FontSizeProvider({ children }: { children: ReactNode }) {
  // applyRootFontSize runs through usePersistedEnum's synchronous apply hook:
  // in the initializer (before children render) so a 'small'/'large' user
  // never sees a flash of the default scale on cold start, and on every set.
  const [fontSize, setFontSize] = usePersistedEnum(
    STORAGE_KEYS.FONT_SIZE,
    VALID,
    'medium',
    applyRootFontSize,
  );

  const value = useMemo(() => ({ fontSize, setFontSize }), [fontSize, setFontSize]);

  return (
    <FontSizeContext.Provider value={value}>
      {children}
    </FontSizeContext.Provider>
  );
}
