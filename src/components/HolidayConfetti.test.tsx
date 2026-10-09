import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { HolidayConfetti } from './HolidayConfetti';

const layer = (container: HTMLElement) =>
  container.querySelector('div[aria-hidden="true"]');

describe('HolidayConfetti', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders nothing at playKey 0 (no trigger yet)', () => {
    const { container } = render(<HolidayConfetti playKey={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('plays a 30-particle burst on a nonzero playKey', () => {
    const { container } = render(<HolidayConfetti playKey={1} />);
    expect(layer(container)).not.toBeNull();
    expect(layer(container)!.querySelectorAll('span')).toHaveLength(30);
  });

  it('auto-hides after the 6s burst window', () => {
    const { container } = render(<HolidayConfetti playKey={1} />);
    expect(layer(container)).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('replays when playKey increments after a burst has ended', () => {
    const { rerender } = render(<HolidayConfetti playKey={1} />);
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(layer(document.body)).toBeNull();

    rerender(<HolidayConfetti playKey={2} />);
    expect(layer(document.body)).not.toBeNull();
    expect(layer(document.body)!.querySelectorAll('span')).toHaveLength(30);
  });

  it('remounts the particles when playKey changes mid-burst, so the animation restarts', () => {
    const { container, rerender } = render(<HolidayConfetti playKey={1} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const firstSpan = container.querySelector('span');

    rerender(<HolidayConfetti playKey={2} />);

    const secondSpan = container.querySelector('span');
    expect(secondSpan).not.toBeNull();
    expect(secondSpan).not.toBe(firstSpan);
    expect(container.querySelectorAll('span')).toHaveLength(30);
  });

  it('hides immediately when playKey returns to 0', () => {
    const { container, rerender } = render(<HolidayConfetti playKey={1} />);
    expect(layer(container)).not.toBeNull();

    rerender(<HolidayConfetti playKey={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mounts nothing for prefers-reduced-motion users', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('reduce'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );

    const { container } = render(<HolidayConfetti playKey={1} />);
    expect(container).toBeEmptyDOMElement();
  });
});
