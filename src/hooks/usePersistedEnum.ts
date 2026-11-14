import { useCallback, useState } from 'react';

/**
 * Persisted enum preference: reads `key` from localStorage, validates it
 * against `valid`, and falls back to `fallback` for missing/tampered
 * values. The setter writes through to localStorage.
 *
 * `apply` runs synchronously in the state initializer and on every set —
 * for side effects that must land before first paint (FontSize's root
 * font-size, Language's <html lang>) rather than in a useEffect, which
 * would flash the default scale/language on cold start. Keep it
 * module-scope-stable and idempotent.
 */
export function usePersistedEnum<T extends string>(
  key: string,
  valid: ReadonlySet<T>,
  fallback: T,
  apply?: (value: T) => void,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const raw = localStorage.getItem(key) as T | null;
    const initial = raw !== null && valid.has(raw) ? raw : fallback;
    apply?.(initial);
    return initial;
  });

  const set = useCallback(
    (next: T) => {
      setValue(next);
      localStorage.setItem(key, next);
      apply?.(next);
    },
    [key, apply],
  );

  return [value, set];
}
