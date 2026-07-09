import { useEffect, useRef, useState } from 'react';
import type { HKOWarning } from '@/lib/hko-types';

export interface WarningDiff {
  added: HKOWarning[];
  removed: HKOWarning[];
}

/**
 * Pure diff: returns the warnings that became active (added) or stopped being
 * active (removed) when moving from `prev` to `current`. Warnings with
 * `actionCode === 'Cancel'` are treated as not-active.
 */
export function diffWarnings(
  prev: { codes: Set<string>; byCode: Map<string, HKOWarning> } | null,
  current: HKOWarning[] | undefined,
): { next: { codes: Set<string>; byCode: Map<string, HKOWarning> }; diff: WarningDiff } {
  if (!current) {
    return { next: { codes: new Set(), byCode: new Map() }, diff: { added: [], removed: [] } };
  }

  const active = current.filter(w => w.actionCode !== 'Cancel');
  const codes = new Set(active.map(w => w.code));
  const byCode = new Map(active.map(w => [w.code, w] as const));

  if (!prev) {
    return { next: { codes, byCode }, diff: { added: [], removed: [] } };
  }

  const added: HKOWarning[] = [];
  for (const w of active) {
    if (!prev.codes.has(w.code)) added.push(w);
  }

  const removed: HKOWarning[] = [];
  for (const code of prev.codes) {
    if (!codes.has(code)) {
      const prevWarning = prev.byCode.get(code);
      removed.push(
        prevWarning ?? ({
          code,
          name: code,
          actionCode: 'Cancel',
          issueTime: '',
          updateTime: '',
        } as HKOWarning),
      );
    }
  }

  return { next: { codes, byCode }, diff: { added, removed } };
}

/**
 * Detects HKO warning set changes between successive polls. Returns the
 * warnings that became newly active (`added`) and the warnings that stopped
 * being active (`removed`).
 *
 * - First non-undefined render is treated as the baseline — no diff is emitted.
 * - Passing a different `resetKey` resets the baseline (use this on city
 *   switches so we don't treat the new city's warning set as "added").
 * - The hook only emits a state change when the diff is non-empty, so renders
 *   with no changes return the previous result without re-rendering consumers.
 */
export function useWarningChangeDetector(
  warnings: HKOWarning[] | undefined,
  resetKey?: string | number,
): WarningDiff {
  const prevRef = useRef<{ codes: Set<string>; byCode: Map<string, HKOWarning> } | null>(null);
  const lastResetKeyRef = useRef(resetKey);
  const [diff, setDiff] = useState<WarningDiff>({ added: [], removed: [] });

  // Reset baseline when resetKey changes (city switch). Mutating a ref during
  // render is acceptable here because the operation is idempotent and we read
  // the ref synchronously below before any commit.
  if (resetKey !== lastResetKeyRef.current) {
    prevRef.current = null;
    lastResetKeyRef.current = resetKey;
  }

  useEffect(() => {
    if (warnings === undefined) {
      prevRef.current = null;
      setDiff({ added: [], removed: [] });
      return;
    }
    const { next, diff: newDiff } = diffWarnings(prevRef.current, warnings);
    prevRef.current = next;

    if (newDiff.added.length === 0 && newDiff.removed.length === 0) {
      return;
    }
    setDiff(newDiff);
  }, [warnings]);

  return diff;
}