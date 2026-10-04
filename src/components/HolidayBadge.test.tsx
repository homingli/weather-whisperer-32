import { describe, it, expect, beforeEach } from 'vitest';
import { LanguageProvider } from '@/contexts/LanguageProvider';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HolidayBadge } from './HolidayBadge';

import type { HolidayCountdown } from '@/lib/holidays/nextHoliday';

const renderWithProviders = (ui: React.ReactElement) =>
  render(<LanguageProvider>{ui}</LanguageProvider>);

const holiday = (overrides: Partial<HolidayCountdown> = {}): HolidayCountdown => ({
  holiday: { date: '2026-06-19', nameEn: 'Dragon Boat Festival', nameTc: '端午節' },
  daysUntil: 5,
  isToday: false,
  ...overrides,
});

describe('HolidayBadge', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders nothing without holiday data (loading / failure / non-HK)', () => {
    const { container } = renderWithProviders(<HolidayBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a compact "{n}d" badge with a full-sentence label', () => {
    renderWithProviders(<HolidayBadge holiday={holiday()} />);

    const badge = screen.getByRole('button', {
      name: '5 days to Dragon Boat Festival. View holiday details.',
    });
    expect(badge).toHaveTextContent('5d');
  });

  it('opens a details dialog with the name, date, and countdown', async () => {
    const user = userEvent.setup();
    renderWithProviders(<HolidayBadge holiday={holiday()} />);

    await user.click(
      screen.getByRole('button', { name: /5 days to Dragon Boat Festival/ })
    );

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Dragon Boat Festival');
    expect(dialog).toHaveTextContent('Jun 19, 2026');
    expect(dialog).toHaveTextContent('Hong Kong public holiday');
    expect(dialog).toHaveTextContent('5 days to Dragon Boat Festival');
  });

  it('flips to the Today phrasing on the holiday itself', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <HolidayBadge holiday={holiday({ daysUntil: 0, isToday: true })} />
    );

    expect(
      screen.getByRole('button', { name: 'Today: Dragon Boat Festival. View holiday details.' })
    ).toHaveTextContent('Today');

    await user.click(screen.getByRole('button', { name: /Today: Dragon Boat Festival/ }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Today: Dragon Boat Festival');
  });

  it('uses the Tomorrow phrasing for a 1-day countdown (no "1 days")', async () => {
    const user = userEvent.setup();
    renderWithProviders(<HolidayBadge holiday={holiday({ daysUntil: 1 })} />);

    expect(
      screen.getByRole('button', { name: /Tomorrow: Dragon Boat Festival/ })
    ).toHaveTextContent('1d');

    await user.click(screen.getByRole('button', { name: /Tomorrow: Dragon Boat Festival/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Tomorrow: Dragon Boat Festival');
    expect(dialog).not.toHaveTextContent('1 days');
  });

  it('uses the active UI language and the holiday’s own translated name', async () => {
    const user = userEvent.setup();
    localStorage.setItem('weather-language', 'tc');
    renderWithProviders(<HolidayBadge holiday={holiday()} />);

    // {0}，查看假期詳情。 — 天 not 日, no spaces around the number.
    await user.click(
      screen.getByRole('button', { name: '仲有5天到端午節，查看假期詳情。' })
    );

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('端午節');
    expect(dialog).toHaveTextContent('2026年6月19日');
  });
});
