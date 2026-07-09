import { useSyncExternalStore } from 'react';
import type { HKOWarning } from './hko-types';

const IS_DEV = import.meta.env.DEV;

interface State {
  simulated: HKOWarning[];
  nonce: number;
}

const state: State = { simulated: [], nonce: 0 };
const listeners = new Set<() => void>();

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

const notify = () => {
  for (const l of listeners) l();
};

const EMPTY_WARNINGS: HKOWarning[] = [];
const ZERO_NONCE = 0;

const makeWarning = (code: string, name?: string): HKOWarning => ({
  // `name` is a placeholder; the consumer resolves the localized name via
  // t(`warnings.${code}`, w.name) so the app's i18n stays the single source
  // of truth and real + simulated warnings render the same way.
  name: name ?? code,
  code,
  actionCode: 'Issue',
  issueTime: new Date().toISOString(),
  updateTime: new Date().toISOString(),
});

/**
 * Subscribes to the dev-only simulated warnings list. Returns an empty array
 * in production.
 */
export const useDevSimulatedWarnings = (): HKOWarning[] => {
  return useSyncExternalStore(
    subscribe,
    IS_DEV ? () => state.simulated : () => EMPTY_WARNINGS,
    IS_DEV ? () => state.simulated : () => EMPTY_WARNINGS,
  );
};

/**
 * Monotonic nonce that bumps each time the dev simulator resets the
 * detector's baseline. Fold into the change detector's `resetKey` so QA can
 * suppress spurious toasts on the next real poll after switching cities.
 * Returns 0 in production.
 */
export const useDevBaselineNonce = (): number => {
  return useSyncExternalStore(
    subscribe,
    IS_DEV ? () => state.nonce : () => ZERO_NONCE,
    IS_DEV ? () => state.nonce : () => ZERO_NONCE,
  );
};

/** Add or replace a fake warning. Fires an "added" toast in the UI. */
export const devAddWarning = (code: string, name?: string): void => {
  if (!IS_DEV) return;
  const warning = makeWarning(code, name);
  state.simulated = [...state.simulated.filter((w) => w.code !== code), warning];
  notify();
};

/** Remove a fake warning. Fires a "cancelled" toast in the UI. */
export const devRemoveWarning = (code: string): void => {
  if (!IS_DEV) return;
  state.simulated = state.simulated.filter((w) => w.code !== code);
  notify();
};

/** Remove all fake warnings. Fires a "cancelled" toast per code. */
export const devClearWarnings = (): void => {
  if (!IS_DEV) return;
  state.simulated = [];
  notify();
};

/**
 * Clear all fake warnings and bump the baseline nonce so the next real poll
 * becomes a fresh baseline (no spurious "added"/"removed" toasts).
 */
export const devResetBaseline = (): void => {
  if (!IS_DEV) return;
  state.simulated = [];
  state.nonce += 1;
  notify();
};

/** Returns a snapshot of the current simulated warnings. */
export const devListWarnings = (): HKOWarning[] => {
  return IS_DEV ? state.simulated.slice() : [];
};
