import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useDevSimulatedWarnings,
  useDevBaselineNonce,
  devAddWarning,
  devRemoveWarning,
  devClearWarnings,
  devResetBaseline,
  devListWarnings,
  devLocalizeAll,
} from './devWarningSimulator';

describe('devWarningSimulator', () => {
  beforeEach(() => {
    // Reset module-level state between tests
    devClearWarnings();
    devResetBaseline();
  });

  describe('hooks', () => {
    it('useDevSimulatedWarnings reflects current simulated list', () => {
      const { result } = renderHook(() => useDevSimulatedWarnings());
      expect(result.current).toEqual([]);

      act(() => devAddWarning('TC8'));
      expect(result.current.map((w) => w.code)).toEqual(['TC8']);

      act(() => devAddWarning('WRAINB'));
      expect(result.current.map((w) => w.code)).toEqual(['TC8', 'WRAINB']);
    });

    it('useDevBaselineNonce starts at 0 and increments on reset', () => {
      const { result: nonce } = renderHook(() => useDevBaselineNonce());
      const initial = nonce.current;
      expect(initial).toBeGreaterThanOrEqual(0);

      act(() => devResetBaseline());
      expect(nonce.current).toBe(initial + 1);

      act(() => devResetBaseline());
      expect(nonce.current).toBe(initial + 2);
    });
  });

  describe('mutators', () => {
    it('devAddWarning appends a new warning', () => {
      devAddWarning('TC8');
      expect(devListWarnings().map((w) => w.code)).toEqual(['TC8']);
    });

    it('devAddWarning replaces a warning with the same code', () => {
      devAddWarning('TC8', 'First');
      devAddWarning('TC8', 'Second');
      const list = devListWarnings();
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('Second');
    });

    it('devAddWarning uses default name from codeToName lookup', () => {
      devAddWarning('TC8');
      expect(devListWarnings()[0].name).toContain('No. 8');
    });

    it('devAddWarning uses TC name when lang=tc is passed', () => {
      devAddWarning('TC8', undefined, 'tc');
      expect(devListWarnings()[0].name).toBe('八號烈風或暴風信號');
    });

    it('devAddWarning falls back to the code itself when unknown', () => {
      devAddWarning('UNKNOWN_CODE');
      expect(devListWarnings()[0].name).toBe('UNKNOWN_CODE');
    });

    it('devLocalizeAll re-translates every simulated warning to the given language', () => {
      devAddWarning('TC8', undefined, 'en');
      devAddWarning('WRAINB', undefined, 'en');
      expect(devListWarnings().map((w) => w.name)).toContain('No. 8 Gale or Storm Signal');
      expect(devListWarnings().map((w) => w.name)).toContain('Black Rainstorm Warning');

      devLocalizeAll('tc');
      const names = devListWarnings().map((w) => w.name);
      expect(names).toContain('八號烈風或暴風信號');
      expect(names).toContain('黑色暴雨警告信號');
    });

    it('devLocalizeAll is a no-op when no warnings are simulated', () => {
      expect(() => devLocalizeAll('tc')).not.toThrow();
      expect(devListWarnings()).toEqual([]);
    });

    it('devRemoveWarning removes a single warning by code', () => {
      devAddWarning('TC8');
      devAddWarning('WRAINB');
      devRemoveWarning('TC8');
      expect(devListWarnings().map((w) => w.code)).toEqual(['WRAINB']);
    });

    it('devRemoveWarning is a no-op for unknown codes', () => {
      devAddWarning('TC8');
      devRemoveWarning('NOT_THERE');
      expect(devListWarnings().map((w) => w.code)).toEqual(['TC8']);
    });

    it('devClearWarnings empties the entire list', () => {
      devAddWarning('TC8');
      devAddWarning('WRAINB');
      devClearWarnings();
      expect(devListWarnings()).toEqual([]);
    });

    it('devResetBaseline empties the list and bumps the nonce', () => {
      devAddWarning('TC8');

      const { result: nonce } = renderHook(() => useDevBaselineNonce());
      const before = nonce.current;

      act(() => devResetBaseline());

      expect(devListWarnings()).toEqual([]);
      expect(nonce.current).toBe(before + 1);
    });

    it('subscribed components re-render when the simulator mutates', () => {
      const { result } = renderHook(() => useDevSimulatedWarnings());
      const first = result.current;
      act(() => devAddWarning('TC8'));
      expect(result.current).not.toBe(first);
      expect(result.current.length).toBe(1);
    });
  });
});
