import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKeySequence } from './useKeySequence';

const press = (key: string, init: KeyboardEventInit = {}) => {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
  });
};

const pressOn = (element: Element, key: string) => {
  act(() => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
};

describe('useKeySequence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onMatch when the full sequence lands within the gap', () => {
    const onMatch = vi.fn();
    renderHook(() => useKeySequence(['c', 'c', 'f', 'f'], 1500, onMatch));

    press('c');
    press('c');
    press('f');
    press('f');

    expect(onMatch).toHaveBeenCalledTimes(1);
  });

  it('does not fire on a partial sequence', () => {
    const onMatch = vi.fn();
    renderHook(() => useKeySequence(['c', 'c', 'f', 'f'], 1500, onMatch));

    press('c');
    press('c');
    press('f');

    expect(onMatch).not.toHaveBeenCalled();
  });

  it('resets when a press exceeds the gap, then accepts a fresh run', () => {
    const onMatch = vi.fn();
    renderHook(() => useKeySequence(['c', 'c', 'f', 'f'], 1500, onMatch));

    press('c');
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    press('c');
    press('f');
    press('f');

    // The pre-gap "c" was stale — the buffer restarted, so this run has only
    // c-f-f of four keys: no fire yet.
    expect(onMatch).not.toHaveBeenCalled();

    press('c');
    press('c');
    press('f');
    press('f');

    expect(onMatch).toHaveBeenCalledTimes(1);
  });

  it('resets on a wrong key, but a first-key press restarts immediately', () => {
    const onMatch = vi.fn();
    renderHook(() => useKeySequence(['c', 'c', 'f', 'f'], 1500, onMatch));

    press('c');
    press('c');
    press('c'); // wrong (expected f) — buffer falls back to progress 1
    press('c'); // progress 2
    press('f');
    press('f');

    expect(onMatch).toHaveBeenCalledTimes(1);
  });

  it('fires again on a second complete run', () => {
    const onMatch = vi.fn();
    renderHook(() => useKeySequence(['c', 'c'], 1500, onMatch));

    press('c');
    press('c');
    press('c');
    press('c');

    expect(onMatch).toHaveBeenCalledTimes(2);
  });

  it('ignores repeat auto-keydowns', () => {
    const onMatch = vi.fn();
    renderHook(() => useKeySequence(['c', 'c'], 1500, onMatch));

    press('c', { repeat: true });
    press('c');

    expect(onMatch).not.toHaveBeenCalled();
  });

  it('ignores modifier combos so copy/paste shortcuts never count', () => {
    const onMatch = vi.fn();
    renderHook(() => useKeySequence(['c', 'c'], 1500, onMatch));

    press('c', { ctrlKey: true });
    press('c');

    expect(onMatch).not.toHaveBeenCalled();
  });

  it('accepts Shift and Caps Lock variants via case-insensitive matching', () => {
    const onMatch = vi.fn();
    renderHook(() => useKeySequence(['c', 'c', 'f', 'f'], 1500, onMatch));

    press('C');
    press('C');
    press('F');
    press('F');

    expect(onMatch).toHaveBeenCalledTimes(1);
  });

  it('ignores keystrokes while a text field owns focus', () => {
    const onMatch = vi.fn();
    renderHook(() => useKeySequence(['c', 'c'], 1500, onMatch));

    const input = document.createElement('input');
    document.body.appendChild(input);
    pressOn(input, 'c');
    pressOn(input, 'c');
    input.remove();

    expect(onMatch).not.toHaveBeenCalled();
  });

  it('binds no listener while disabled', () => {
    const onMatch = vi.fn();
    renderHook(() => useKeySequence(['c', 'c'], 1500, onMatch, false));

    press('c');
    press('c');

    expect(onMatch).not.toHaveBeenCalled();
  });
});
