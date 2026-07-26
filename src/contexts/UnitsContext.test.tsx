import { describe, it, expect, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { UnitsProvider, useUnits } from '@/contexts/UnitsContext';

type UnitsValue = ReturnType<typeof useUnits>;

let latest: UnitsValue | null = null;
function Probe() {
  latest = useUnits();
  return null;
}
function read(): UnitsValue {
  if (!latest) throw new Error('Probe never rendered');
  return latest;
}

describe('UnitsContext', () => {
  beforeEach(() => {
    localStorage.clear();
    latest = null;
  });

  it('defaults to metric when no preference is stored', () => {
    render(<UnitsProvider><Probe /></UnitsProvider>);
    expect(read().units).toBe('metric');
  });

  it('persists choice to localStorage', () => {
    render(<UnitsProvider><Probe /></UnitsProvider>);
    act(() => read().setUnits('us'));
    expect(localStorage.getItem('weather-units')).toBe('us');
  });

  it('reads existing preference from localStorage on mount', () => {
    localStorage.setItem('weather-units', 'us');
    render(<UnitsProvider><Probe /></UnitsProvider>);
    expect(read().units).toBe('us');
  });

  it('setUnits(us) updates in-memory state', () => {
    render(<UnitsProvider><Probe /></UnitsProvider>);
    expect(read().units).toBe('metric');
    act(() => read().setUnits('us'));
    expect(read().units).toBe('us');
  });

  it('setUnits(metric) flips back from us', () => {
    localStorage.setItem('weather-units', 'us');
    render(<UnitsProvider><Probe /></UnitsProvider>);
    expect(read().units).toBe('us');
    act(() => read().setUnits('metric'));
    expect(read().units).toBe('metric');
    expect(localStorage.getItem('weather-units')).toBe('metric');
  });

  it('drops invalid localStorage values to default metric', () => {
    localStorage.setItem('weather-units', 'kelvin');
    render(<UnitsProvider><Probe /></UnitsProvider>);
    expect(read().units).toBe('metric');
  });
});