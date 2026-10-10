import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnitsProvider } from '@/contexts/UnitsProvider';
import { LanguageProvider } from '@/contexts/LanguageProvider';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { ShareForecastButton } from './ShareForecastButton';
import type { DailyForecast } from '@/lib/weather';

const DEEP_LINK = 'https://weather-whisperer.example/?lat=22.319&lon=114.169&name=Kowloon';

function day(overrides: Partial<DailyForecast> = {}): DailyForecast {
  const date = new Date('2026-09-19T04:00:00Z');
  return {
    date,
    temperatureMax: 28,
    temperatureMin: 24,
    weatherCode: 0,
    windSpeedMax: 12,
    windDirectionDominant: 90,
    precipitationProbabilityMax: 0,
    sunrise: date,
    sunset: date,
    ...overrides,
  };
}

const renderButton = (url?: string) =>
  render(
    <LanguageProvider>
      <UnitsProvider>
        <ShareForecastButton
          cityName="Kowloon"
          days={[day()]}
          url={url}
        />
      </UnitsProvider>
    </LanguageProvider>,
  );

const user = () =>
  userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });

beforeEach(() => {
  localStorage.clear();
});

describe('ShareForecastButton deep-link URL', () => {
  it('appends the deep-link URL to the shared text', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });

    renderButton(DEEP_LINK);
    await user().click(screen.getByRole('button', { name: /share/i }));

    await waitFor(() => {
      expect(share).toHaveBeenCalled();
    });
    const text = share.mock.calls[0][0].text as string;
    expect(text.split('\n').pop()).toBe(DEEP_LINK);

    // @ts-expect-error — restoring the stubbed property in jsdom.
    delete navigator.share;
  });

  it('falls back to the bare origin when no deep-link URL is given', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });

    renderButton();
    await user().click(screen.getByRole('button', { name: /share/i }));

    await waitFor(() => {
      expect(share).toHaveBeenCalled();
    });
    const text = share.mock.calls[0][0].text as string;
    expect(text.split('\n').pop()).toBe(window.location.origin);
    expect(text).not.toContain('lat=');

    // @ts-expect-error — restoring the stubbed property in jsdom.
    delete navigator.share;
  });

  it('copies the deep-link URL to the clipboard when the share sheet is unavailable', async () => {
    // Setting undefined (not delete) — a prototype-level share would
    // resurface after delete and the button would take the share path.
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    // user-event's setup() installs its own navigator.clipboard stub, so the
    // mock must be defined AFTER setup or the click writes to user-event's
    // internal clipboard instead of this spy.
    const u = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    renderButton(DEEP_LINK);
    await u.click(screen.getByRole('button', { name: /share/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalled();
    });
    expect((writeText.mock.calls[0][0] as string).split('\n').pop()).toBe(DEEP_LINK);

    // @ts-expect-error — restoring the stubbed property in jsdom.
    delete navigator.clipboard;
  });
});
