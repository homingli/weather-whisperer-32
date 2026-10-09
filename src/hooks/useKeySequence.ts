import { useCallback, useEffect, useRef } from 'react';

/**
 * useKeySequence — konami-style keyboard easter egg trigger.
 *
 * Fires `onMatch` when the user presses `sequence` in order, allowing at
 * most `gapMs` between consecutive presses. A slow press, a wrong press,
 * or a modifier combo (Ctrl/Meta/Alt — copy/paste shortcuts must never
 * count) resets the buffer; a press matching the first key restarts
 * immediately, so mashing the opener key still works.
 *
 * Keystrokes are ignored while a text field owns focus (city search,
 * settings inputs) and `repeat` auto-repeats are dropped, so typing can
 * never satisfy the sequence. `enabled` lets callers scope the listener.
 */
export function useKeySequence(
  sequence: readonly string[],
  gapMs: number,
  onMatch: () => void,
  enabled = true,
): void {
  const progressRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const onMatchRef = useRef(onMatch);

  // Keep the latest callback without re-binding the window listener.
  useEffect(() => {
    onMatchRef.current = onMatch;
  }, [onMatch]);

  const reset = useCallback(() => {
    progressRef.current = 0;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const armTimer = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(reset, gapMs);
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === sequence[progressRef.current]) {
        progressRef.current += 1;
        if (progressRef.current === sequence.length) {
          reset();
          onMatchRef.current();
          return;
        }
        armTimer();
      } else {
        reset();
        if (key === sequence[0]) {
          progressRef.current = 1;
          armTimer();
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [sequence, gapMs, enabled, reset]);
}
