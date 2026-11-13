import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersistedEnum } from './usePersistedEnum';

const VALID = new Set<'a' | 'b'>(['a', 'b']);

let applyLog: string[] = [];
const apply = (v: 'a' | 'b') => {
  applyLog.push(v);
};

function render() {
  return renderHook(() => usePersistedEnum('test-key', VALID, 'a', apply));
}

describe('usePersistedEnum', () => {
  beforeEach(() => {
    localStorage.clear();
    applyLog = [];
  });

  it('returns the fallback when nothing is stored', () => {
    const { result } = render();
    expect(result.current[0]).toBe('a');
    expect(applyLog).toEqual(['a']);
  });

  it('reads a valid stored value', () => {
    localStorage.setItem('test-key', 'b');
    const { result } = render();
    expect(result.current[0]).toBe('b');
  });

  it('drops a tampered stored value to the fallback', () => {
    localStorage.setItem('test-key', 'zzz');
    const { result } = render();
    expect(result.current[0]).toBe('a');
  });

  it('persists the choice and runs apply on set', () => {
    const { result } = render();
    act(() => result.current[1]('b'));
    expect(result.current[0]).toBe('b');
    expect(localStorage.getItem('test-key')).toBe('b');
    expect(applyLog).toEqual(['a', 'b']);
  });
});
