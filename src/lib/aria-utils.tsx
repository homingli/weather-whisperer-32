import { createContext, useContext } from 'react';

export type Priority = 'polite' | 'assertive';

interface StatusRegionValue {
  /** Push a message into the single sr-only aria-live region. */
  announce: (message: string, priority?: Priority) => void;
}

export const StatusRegionContext = createContext<StatusRegionValue | null>(null);

export function useStatusRegion(): StatusRegionValue {
  const ctx = useContext(StatusRegionContext);
  // Gracefully degrade to a no-op when used outside the provider — this
  // keeps unit tests that render components in isolation working without
  // a full app shell. Production renders always wrap with the provider.
  if (!ctx) {
    return { announce: () => undefined };
  }
  return ctx;
}
