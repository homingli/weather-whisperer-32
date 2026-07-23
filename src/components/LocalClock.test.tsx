import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { LocalClock } from './LocalClock';
import { LanguageProvider } from '@/contexts/LanguageContext';

const renderWithLanguage = (ui: React.ReactElement) =>
  render(<LanguageProvider>{ui}</LanguageProvider>);

describe('LocalClock Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Pin the system clock so the formatted output is deterministic.
    // 2024-01-08 12:00:00 UTC.
    vi.setSystemTime(new Date(Date.UTC(2024, 0, 8, 12, 0, 0)));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders correctly for Hong Kong (GMT+8)', () => {
    renderWithLanguage(<LocalClock timezone="Asia/Hong_Kong" />);

    // HK time should be 12:00 + 8h = 20:00.
    // The component uses Intl.DateTimeFormat with the provided timezone
    // and a 12-hour clock for English.
    expect(screen.getByText(/0?8:00:00 PM/i)).toBeInTheDocument();
    expect(screen.getByText(/Monday, January 8, 2024/i)).toBeInTheDocument();
  });

  it('renders correctly for New York (GMT-5)', () => {
    renderWithLanguage(<LocalClock timezone="America/New_York" />);

    // NY time should be 12:00 - 5h = 07:00.
    expect(screen.getByText(/0?7:00:00 AM/i)).toBeInTheDocument();
  });

  it('updates time every second', () => {
    renderWithLanguage(<LocalClock timezone="Europe/London" />);

    expect(screen.getByText(/12:00:00 PM/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText(/12:00:01 PM/i)).toBeInTheDocument();
  });
});