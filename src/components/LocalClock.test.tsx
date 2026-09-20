import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { LocalClock } from './LocalClock';
import { LanguageProvider } from '@/contexts/LanguageContext';

const renderWithLanguage = (ui: React.ReactElement) =>
  render(<LanguageProvider>{ui}</LanguageProvider>);

// jsdom doesn't load Tailwind, so `hidden sm:inline` and `sm:hidden` both
// render in the DOM and getByText matches either. We test narrow viewport
// behaviour by stubbing window.matchMedia so the component switches its
// rendered tree to the narrow branch.
const stubMatchMedia = (matches: boolean) => {
  vi.stubGlobal('matchMedia', ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as typeof window.matchMedia);
};

describe('LocalClock Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Pin the system clock so the formatted output is deterministic.
    // 2024-01-08 12:00:00 UTC.
    vi.setSystemTime(new Date(Date.UTC(2024, 0, 8, 12, 0, 0)));
    // Default: wide viewport (>= sm).
    stubMatchMedia(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders correctly for Hong Kong (GMT+8) on wide viewport', () => {
    renderWithLanguage(<LocalClock timezone="Asia/Hong_Kong" />);

    // HK time should be 12:00 + 8h = 20:00.
    // Wide viewport shows HH:MM:SS.
    expect(screen.getByText(/0?8:00:00 PM/i)).toBeInTheDocument();
    expect(screen.getByText(/Monday, January 8, 2024/i)).toBeInTheDocument();
  });

  it('renders correctly for New York (GMT-5) on wide viewport', () => {
    renderWithLanguage(<LocalClock timezone="America/New_York" />);

    // NY time should be 12:00 - 5h = 07:00.
    expect(screen.getByText(/0?7:00:00 AM/i)).toBeInTheDocument();
  });

  it('updates time every second on wide viewport', () => {
    renderWithLanguage(<LocalClock timezone="Europe/London" />);

    expect(screen.getByText(/12:00:00 PM/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText(/12:00:01 PM/i)).toBeInTheDocument();
  });

  it('drops seconds from display on narrow viewport', () => {
    stubMatchMedia(true);
    renderWithLanguage(<LocalClock timezone="Asia/Hong_Kong" />);

    // HK 20:00, but no seconds — the wide-viewport "08:00:00 PM" must NOT appear.
    expect(screen.queryByText(/0?8:00:00 PM/i)).toBeNull();
    expect(screen.getByText(/0?8:00 PM/i)).toBeInTheDocument();
  });

  it('uses 60s interval on narrow viewport (no re-render between minutes)', () => {
    stubMatchMedia(true);
    renderWithLanguage(<LocalClock timezone="Europe/London" />);

    // First render at 12:00:00.
    expect(screen.getByText(/12:00 PM/i)).toBeInTheDocument();

    // Advancing 59s must NOT change the displayed minute on narrow viewport.
    act(() => {
      vi.advanceTimersByTime(59_000);
    });
    expect(screen.getByText(/12:00 PM/i)).toBeInTheDocument();

    // First aligned tick fires at the next minute boundary (already past
    // because we stubbed time to a round minute). After 60s, minute flips.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText(/12:01 PM/i)).toBeInTheDocument();
  });

  it('uses 1s interval on wide viewport (updates within a minute)', () => {
    renderWithLanguage(<LocalClock timezone="Europe/London" />);

    expect(screen.getByText(/12:00:00 PM/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText(/12:00:01 PM/i)).toBeInTheDocument();
  });
});