import { describe, it, expect, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { FontSizeProvider, useFontSize, FONT_SIZE_ROOT_PERCENT } from '@/contexts/FontSizeContext';

type FontSizeValue = ReturnType<typeof useFontSize>;

let latest: FontSizeValue | null = null;
function Probe() {
  latest = useFontSize();
  return null;
}
function read(): FontSizeValue {
  if (!latest) throw new Error('Probe never rendered');
  return latest;
}

describe('FontSizeContext', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.removeProperty('font-size');
    latest = null;
  });

  it('defaults to medium when no preference is stored', () => {
    render(<FontSizeProvider><Probe /></FontSizeProvider>);
    expect(read().fontSize).toBe('medium');
    // Medium is the app's designed look — no inline override.
    expect(document.documentElement.style.fontSize).toBe('');
  });

  it('persists choice to localStorage', () => {
    render(<FontSizeProvider><Probe /></FontSizeProvider>);
    act(() => read().setFontSize('small'));
    expect(localStorage.getItem('weather-font-size')).toBe('small');
  });

  it('reads existing preference from localStorage on mount', () => {
    localStorage.setItem('weather-font-size', 'large');
    render(<FontSizeProvider><Probe /></FontSizeProvider>);
    expect(read().fontSize).toBe('large');
  });

  it('applies root font-size immediately on mount (no flash of default scale)', () => {
    localStorage.setItem('weather-font-size', 'small');
    render(<FontSizeProvider><Probe /></FontSizeProvider>);
    expect(document.documentElement.style.fontSize).toBe(FONT_SIZE_ROOT_PERCENT.small);
  });

  it('setFontSize(large) updates state, storage and the root font-size', () => {
    render(<FontSizeProvider><Probe /></FontSizeProvider>);
    act(() => read().setFontSize('large'));
    expect(read().fontSize).toBe('large');
    expect(localStorage.getItem('weather-font-size')).toBe('large');
    expect(document.documentElement.style.fontSize).toBe(FONT_SIZE_ROOT_PERCENT.large);
  });

  it('setFontSize(medium) removes the inline root override', () => {
    localStorage.setItem('weather-font-size', 'small');
    render(<FontSizeProvider><Probe /></FontSizeProvider>);
    expect(document.documentElement.style.fontSize).toBe(FONT_SIZE_ROOT_PERCENT.small);
    act(() => read().setFontSize('medium'));
    expect(document.documentElement.style.fontSize).toBe('');
    expect(localStorage.getItem('weather-font-size')).toBe('medium');
  });

  it('drops invalid localStorage values to default medium', () => {
    localStorage.setItem('weather-font-size', 'huge');
    render(<FontSizeProvider><Probe /></FontSizeProvider>);
    expect(read().fontSize).toBe('medium');
    expect(document.documentElement.style.fontSize).toBe('');
  });
});
