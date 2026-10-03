import { createContext, useContext } from 'react';

export type FontSize = 'small' | 'medium' | 'large';

interface FontSizeContextType {
  fontSize: FontSize;
  setFontSize: (next: FontSize) => void;
}

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
  small: '80%',
  medium: '100%',
  large: '125%',
};

export const FontSizeContext = createContext<FontSizeContextType | undefined>(undefined);

export function useFontSize() {
  const context = useContext(FontSizeContext);
  if (context === undefined) {
    throw new Error('useFontSize must be used within a FontSizeProvider');
  }
  return context;
}

