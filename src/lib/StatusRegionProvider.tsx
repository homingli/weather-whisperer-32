import { useCallback, useState, type ReactNode } from 'react';
import { StatusRegionContext, type Priority } from './aria-utils';

/**
 * Provides a single sr-only aria-live region that any descendant
 * component can push announcements into. Used for status changes that
 * need to be read aloud by screen readers (fetch results, error
 * transitions, new warnings, etc.) — see ADA compliance plan, Fix #6.
 */
export function StatusRegionProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<Priority>('polite');

  const announce = useCallback((msg: string, prio: Priority = 'polite') => {
    // Clear then re-set so identical messages still get re-announced
    // (screen readers do not re-read unchanged text).
    setMessage('');
    setTimeout(() => {
      setMessage(msg);
      setPriority(prio);
    }, 50);
  }, []);

  return (
    <StatusRegionContext.Provider value={{ announce }}>
      {/*
        Single live region. Priority is read at announcement time so the
        latest call wins (polite default, assertive for urgent updates).
      */}
      <div
        role="status"
        aria-live={priority}
        aria-atomic="true"
        className="sr-only"
      >
        {message}
      </div>
      {children}
    </StatusRegionContext.Provider>
  );
}
