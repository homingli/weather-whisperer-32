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

    it('devAddWarning uses the code as a placeholder name (consumer resolves i18n)', () => {
      devAddWarning('TC8');
      expect(devListWarnings()[0].name).toBe('TC8');
    });

    it('devAddWarning accepts an explicit name override', () => {
      devAddWarning('XYZ', 'My Custom Name');
      expect(devListWarnings()[0].name).toBe('My Custom Name');
    });

    it('devAddWarning falls back to the code when no name is given', () => {
      devAddWarning('UNKNOWN_CODE');
      expect(devListWarnings()[0].name).toBe('UNKNOWN_CODE');
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
