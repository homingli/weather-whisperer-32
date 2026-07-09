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

const codeToNameEn: Record<string, string> = {
  TC1: 'Standby Signal No. 1',
  TC3: 'Strong Wind Signal No. 3',
  TC8: 'No. 8 Gale or Storm Signal',
  TC8NE: 'No. 8 Northeast Gale or Storm Signal',
  TC8SE: 'No. 8 Southeast Gale or Storm Signal',
  TC8SW: 'No. 8 Southwest Gale or Storm Signal',
  TC8NW: 'No. 8 Northwest Gale or Storm Signal',
  TC9: 'No. 9 Increasing Gale or Storm Signal',
  TC10: 'No. 10 Hurricane Signal',
  WRAIN: 'Amber Rainstorm Warning',
  WRAINR: 'Red Rainstorm Warning',
  WRAINB: 'Black Rainstorm Warning',
  HKA: 'Very Hot Weather Warning',
  COLD: 'Cold Weather Warning',
  TS: 'Thunderstorm Warning',
  FL: 'Frost Warning',
  MW: 'Strong Monsoon Signal',
  LM: 'Landslip Warning',
  FOG: 'Fog Warning',
  WFIRE: 'Fire Danger Warning',
  WFNTSA: 'New Territories Northern Waters Flooding',
};

const codeToNameTc: Record<string, string> = {
  TC1: '一號戒備信號',
  TC3: '三號強風信號',
  TC8: '八號烈風或暴風信號',
  TC8NE: '八號東北烈風或暴風信號',
  TC8SE: '八號東南烈風或暴風信號',
  TC8SW: '八號西南烈風或暴風信號',
  TC8NW: '八號西北烈風或暴風信號',
  TC9: '九號烈風或暴風增強信號',
  TC10: '十號颶風信號',
  WRAIN: '黃色暴雨警告信號',
  WRAINR: '紅色暴雨警告信號',
  WRAINB: '黑色暴雨警告信號',
  HKA: '酷熱天氣警告',
  COLD: '寒冷天氣警告',
  TS: '雷暴警告',
  FL: '霜凍警告',
  MW: '強烈季候風信號',
  LM: '山泥傾瀉警告',
  FOG: '霧警告',
  WFIRE: '火災危險警告',
  WFNTSA: '新界北部水浸特別報告',
};

const localizedName = (code: string, lang: 'en' | 'tc'): string => {
  const map = lang === 'tc' ? codeToNameTc : codeToNameEn;
  return map[code] ?? code;
};

const makeWarning = (code: string, name?: string, lang: 'en' | 'tc' = 'en'): HKOWarning => ({
  name: name ?? localizedName(code, lang),
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
export const devAddWarning = (code: string, name?: string, lang: 'en' | 'tc' = 'en'): void => {
  if (!IS_DEV) return;
  const warning = makeWarning(code, name, lang);
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

/**
 * Re-translate every currently simulated warning's name to the given language.
 * Called automatically by Index.tsx on language change so dev warnings stay in
 * sync with the user's selected language. Custom names passed to
 * `devAddWarning(code, customName)` will be replaced with the localized
 * default — re-add after switching language to keep a custom name.
 */
export const devLocalizeAll = (lang: 'en' | 'tc'): void => {
  if (!IS_DEV) return;
  state.simulated = state.simulated.map((w) => ({
    ...w,
    name: localizedName(w.code, lang),
  }));
  notify();
};
