/// <reference types="vite/client" />

import type { HKOWarning } from './lib/hko-types';

declare global {
  interface Window {
    __devWarnings?: {
      add: (code: string, name?: string, lang?: 'en' | 'tc') => void;
      remove: (code: string) => void;
      clear: () => void;
      reset: () => void;
      list: () => HKOWarning[];
      localize: (lang: 'en' | 'tc') => void;
    };
  }
}

export {};
