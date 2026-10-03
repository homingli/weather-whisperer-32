import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel, type UserEvent } from '@testing-library/user-event';
import { LanguageProvider } from '@/contexts/LanguageProvider';
import { LINEAR_INTAKE_EMAIL } from '@/lib/feedback';
import { FeedbackDialog } from './FeedbackDialog';

const noop = () => {};

function renderDialog() {
  return render(
    <LanguageProvider>
      <FeedbackDialog open onOpenChange={noop} />
    </LanguageProvider>,
  );
}

function mailtoHref(): string {
  return screen.getByRole('link', { name: /send email/i }).getAttribute('href') ?? '';
}

describe('FeedbackDialog (HML-44)', () => {
  let user: UserEvent;

  beforeEach(() => {
    localStorage.clear();
    user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
  });

  it('shows the three feedback types with Bug preselected', () => {
    renderDialog();
    expect(screen.getByRole('radio', { name: 'Bug report' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Feature request' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Question' })).not.toBeChecked();
  });

  it('builds a mailto link to the Linear intake address with the Bug prefix', () => {
    renderDialog();
    const href = mailtoHref();
    expect(href.startsWith(`mailto:${LINEAR_INTAKE_EMAIL}?`)).toBe(true);
    expect(decodeURIComponent(href)).toContain('[Bug]');
  });

  it('switches the subject prefix when the type changes', async () => {
    renderDialog();
    await user.click(screen.getByRole('radio', { name: 'Feature request' }));
    const href = decodeURIComponent(mailtoHref());
    expect(href).toContain('[Feature]');
    expect(href).not.toContain('[Bug]');
  });

  it('prefills the body with auto-collected device diagnostics', () => {
    renderDialog();
    const href = decodeURIComponent(mailtoHref());
    const body = href.split('body=')[1] ?? '';
    expect(body).toContain('App: Weather Whisperer');
    expect(body).toContain('Language: en');
    expect(body).toContain('Platform:'); // user agent line
  });

  it('copies the diagnostics block to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    // jsdom exposes navigator.clipboard as a getter-only property — a plain
    // assignment throws, so replace it via a configurable defineProperty.
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    try {
      renderDialog();
      await user.click(screen.getByRole('button', { name: /copy details/i }));
      expect(writeText).toHaveBeenCalledTimes(1);
      expect(String(writeText.mock.calls[0][0])).toContain('App: Weather Whisperer');
    } finally {
      delete (navigator as unknown as { clipboard?: unknown }).clipboard;
    }
  });

  it('renders Traditional Chinese labels after switching language', () => {
    localStorage.setItem('weather-language', 'tc');
    renderDialog();
    expect(screen.getByRole('radio', { name: '回報問題' })).toBeChecked();
    expect(screen.getByRole('link', { name: '傳送電郵' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '複製詳情' })).toBeInTheDocument();
  });
});
