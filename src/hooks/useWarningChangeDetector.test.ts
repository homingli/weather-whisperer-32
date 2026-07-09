import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWarningChangeDetector, diffWarnings } from './useWarningChangeDetector';
import type { HKOWarning } from '@/lib/hko-types';

const makeWarning = (overrides: Partial<HKOWarning> = {}): HKOWarning => ({
  name: 'Test Warning',
  code: 'TEST',
  actionCode: 'Issue',
  issueTime: '2024-01-01T00:00:00+08:00',
  updateTime: '2024-01-01T00:00:00+08:00',
  ...overrides,
});

describe('diffWarnings (pure)', () => {
  it('returns empty diff on first call (no prev)', () => {
    const result = diffWarnings(null, [makeWarning()]);
    expect(result.diff.added).toEqual([]);
    expect(result.diff.removed).toEqual([]);
    expect(result.next.codes.has('TEST')).toBe(true);
  });

  it('returns empty diff when undefined current', () => {
    const prev = { codes: new Set(['A']), byCode: new Map([['A', makeWarning({ code: 'A' })]]) };
    const result = diffWarnings(prev, undefined);
    expect(result.diff.added).toEqual([]);
    expect(result.diff.removed).toEqual([]);
    expect(result.next.codes.size).toBe(0);
  });

  it('treats Cancel actionCode as not-active', () => {
    const cancel = makeWarning({ code: 'A', actionCode: 'Cancel' });
    const result = diffWarnings(null, [cancel]);
    expect(result.next.codes.size).toBe(0);
  });

  it('detects newly added active warning', () => {
    const prev = { codes: new Set<string>(), byCode: new Map<string, HKOWarning>() };
    const result = diffWarnings(prev, [makeWarning({ code: 'TC8', name: 'Typhoon 8' })]);
    expect(result.diff.added).toHaveLength(1);
    expect(result.diff.added[0].code).toBe('TC8');
    expect(result.diff.removed).toEqual([]);
  });

  it('detects removed active warning', () => {
    const w = makeWarning({ code: 'TC8', name: 'Typhoon 8' });
    const prev = { codes: new Set(['TC8']), byCode: new Map([['TC8', w]]) };
    const result = diffWarnings(prev, []);
    expect(result.diff.removed).toHaveLength(1);
    expect(result.diff.removed[0].code).toBe('TC8');
    expect(result.diff.added).toEqual([]);
  });

  it('Issue -> Cancel on same code counts as removed', () => {
    const issued = makeWarning({ code: 'TC8', actionCode: 'Issue' });
    const prev = { codes: new Set(['TC8']), byCode: new Map([['TC8', issued]]) };
    const cancelled = makeWarning({ code: 'TC8', actionCode: 'Cancel', name: 'Typhoon 8 (Cancelled)' });
    const result = diffWarnings(prev, [cancelled]);
    expect(result.diff.added).toEqual([]);
    expect(result.diff.removed).toHaveLength(1);
    expect(result.diff.removed[0].code).toBe('TC8');
  });

  it('Reissue on same code produces no diff', () => {
    const v1 = makeWarning({ code: 'TC8', updateTime: '2024-01-01T00:00:00+08:00' });
    const v2 = makeWarning({ code: 'TC8', actionCode: 'Reissue', updateTime: '2024-01-01T03:00:00+08:00' });
    const prev = { codes: new Set(['TC8']), byCode: new Map([['TC8', v1]]) };
    const result = diffWarnings(prev, [v2]);
    expect(result.diff.added).toEqual([]);
    expect(result.diff.removed).toEqual([]);
  });

  it('emits added and removed in same diff', () => {
    const old = makeWarning({ code: 'TC8' });
    const prev = { codes: new Set(['TC8']), byCode: new Map([['TC8', old]]) };
    const result = diffWarnings(prev, [makeWarning({ code: 'RAIN_RED', name: 'Red Rainstorm' })]);
    expect(result.diff.added.map(w => w.code)).toEqual(['RAIN_RED']);
    expect(result.diff.removed.map(w => w.code)).toEqual(['TC8']);
  });

  it('uses prev warning object when synthesizing removed fallback', () => {
    const w = makeWarning({ code: 'TC8', name: 'Typhoon Signal No. 8' });
    const prev = { codes: new Set(['TC8']), byCode: new Map([['TC8', w]]) };
    const result = diffWarnings(prev, []);
    expect(result.diff.removed[0]).toBe(w);
  });

  it('synthesizes minimal placeholder when prev byCode missing the code', () => {
    const prev = { codes: new Set(['GHOST']), byCode: new Map<string, HKOWarning>() };
    const result = diffWarnings(prev, []);
    expect(result.diff.removed).toHaveLength(1);
    expect(result.diff.removed[0].code).toBe('GHOST');
    expect(result.diff.removed[0].actionCode).toBe('Cancel');
  });
});

describe('useWarningChangeDetector (hook)', () => {
  it('treats first render as baseline (no diff emitted)', () => {
    const { result } = renderHook(({ warnings }) => useWarningChangeDetector(warnings), {
      initialProps: { warnings: [makeWarning({ code: 'A' })] as HKOWarning[] | undefined },
    });
    expect(result.current.added).toEqual([]);
    expect(result.current.removed).toEqual([]);
  });

  it('does not emit a diff when same content stays the same', () => {
    const w = [makeWarning({ code: 'A' })];
    const { result, rerender } = renderHook(({ warnings }) => useWarningChangeDetector(warnings), {
      initialProps: { warnings: w as HKOWarning[] | undefined },
    });
    // Same reference — effect doesn't re-fire, result stays baseline
    rerender({ warnings: w });
    expect(result.current.added).toEqual([]);
    expect(result.current.removed).toEqual([]);
  });

  it('emits added when new warning appears', () => {
    const { result, rerender } = renderHook(({ warnings }) => useWarningChangeDetector(warnings), {
      initialProps: { warnings: [] as HKOWarning[] | undefined },
    });
    rerender({ warnings: [makeWarning({ code: 'A' })] });
    expect(result.current.added.map(w => w.code)).toEqual(['A']);
    expect(result.current.removed).toEqual([]);
  });

  it('emits removed when warning disappears', () => {
    const { result, rerender } = renderHook(({ warnings }) => useWarningChangeDetector(warnings), {
      initialProps: { warnings: [makeWarning({ code: 'A' })] as HKOWarning[] | undefined },
    });
    rerender({ warnings: [] });
    expect(result.current.removed.map(w => w.code)).toEqual(['A']);
    expect(result.current.added).toEqual([]);
  });

  it('emits both added and removed when both change', () => {
    const { result, rerender } = renderHook(({ warnings }) => useWarningChangeDetector(warnings), {
      initialProps: { warnings: [makeWarning({ code: 'A' })] as HKOWarning[] | undefined },
    });
    rerender({ warnings: [makeWarning({ code: 'B' })] });
    expect(result.current.added.map(w => w.code)).toEqual(['B']);
    expect(result.current.removed.map(w => w.code)).toEqual(['A']);
  });

  it('resets baseline when resetKey changes', () => {
    const { result, rerender } = renderHook(
      ({ warnings, key }: { warnings: HKOWarning[]; key: string }) => useWarningChangeDetector(warnings, key),
      {
        initialProps: {
          warnings: [makeWarning({ code: 'A' })],
          key: 'city-1',
        },
      },
    );
    // City switch: same warning but new key. Should NOT emit "removed A".
    rerender({
      warnings: [makeWarning({ code: 'A' })],
      key: 'city-2',
    });
    expect(result.current.added).toEqual([]);
    expect(result.current.removed).toEqual([]);
  });

  it('resets baseline on warnings becoming undefined', () => {
    const { result, rerender } = renderHook(({ warnings }) => useWarningChangeDetector(warnings), {
      initialProps: { warnings: [makeWarning({ code: 'A' })] as HKOWarning[] | undefined },
    });
    rerender({ warnings: undefined });
    expect(result.current.added).toEqual([]);
    expect(result.current.removed).toEqual([]);
    // After reset, the next non-undefined render is a new baseline
    rerender({ warnings: [makeWarning({ code: 'B' })] });
    expect(result.current.added).toEqual([]);
    expect(result.current.removed).toEqual([]);
  });
});