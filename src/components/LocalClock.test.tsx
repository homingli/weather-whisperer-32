import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LanguageProvider } from '@/contexts/LanguageProvider';
import { render, screen, act } from '@testing-library/react';
import { LocalClock } from './LocalClock';


const renderWithLanguage = (ui: React.ReactElement) =>
  render(<LanguageProvider>{ui}</LanguageProvider>);

describe('LocalClock Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Pin the system clock to a round minute so the formatted output is
    // deterministic and the first tick lands exactly 60s later.
    // 2024-01-08 12:00:00 UTC.
    vi.setSystemTime(new Date(Date.UTC(2024, 0, 8, 12, 0, 0)));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders correctly for Hong Kong (GMT+8), date + HH:MM without seconds', () => {
    renderWithLanguage(<LocalClock timezone="Asia/Hong_Kong" />);

    // HK time should be 12:00 + 8h = 20:00. Seconds are never shown.
    expect(screen.getByText(/0?8:00 PM/i)).toBeInTheDocument();
    expect(screen.queryByText(/0?8:00:00/i)).toBeNull();
    expect(screen.getByText(/Monday, January 8, 2024/i)).toBeInTheDocument();
  });

  it('renders correctly for New York (GMT-5)', () => {
    renderWithLanguage(<LocalClock timezone="America/New_York" />);

    // NY time should be 12:00 - 5h = 07:00.
    expect(screen.getByText(/0?7:00 AM/i)).toBeInTheDocument();
  });

  it('ticks once a minute, aligned to the minute boundary', () => {
    renderWithLanguage(<LocalClock timezone="Europe/London" />);

    expect(screen.getByText(/12:00 PM/i)).toBeInTheDocument();

    // Advancing 59s must NOT change the displayed minute (no seconds to
    // update either — the component sits idle between minute boundaries).
    act(() => {
      vi.advanceTimersByTime(59_000);
    });
    expect(screen.getByText(/12:00 PM/i)).toBeInTheDocument();

    // First aligned tick fires at the next minute boundary; the minute flips.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText(/12:01 PM/i)).toBeInTheDocument();
  });
});
