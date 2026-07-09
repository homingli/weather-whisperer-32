/// <reference types="vite/client" />

import type { HKOWarning } from './lib/hko-types';

declare global {
  interface Window {
    __devWarnings?: {
      add: (code: string, name?: string) => void;
      remove: (code: string) => void;
      clear: () => void;
      reset: () => void;
      list: () => HKOWarning[];
    };
  }
}

export {};
