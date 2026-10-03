import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel, type UserEvent } from '@testing-library/user-event';
import { LanguageProvider } from '@/contexts/LanguageProvider';
import { FEEDBACK_MAX_MESSAGE_LENGTH } from '@/lib/feedback';
import { MAX_MESSAGE_LENGTH } from '../../api/feedback';
import { FeedbackDialog } from './FeedbackDialog';

const OK_RESPONSE = () => new Response(JSON.stringify({ ok: true }), { status: 200 });

function renderDialog(onOpenChange = vi.fn()) {
  render(
    <LanguageProvider>
      <FeedbackDialog open onOpenChange={onOpenChange} />
    </LanguageProvider>,
  );
  return onOpenChange;
}

async function fillAndSend(user: UserEvent, message = 'Rain map is blank') {
  await user.type(screen.getByRole('textbox', { name: 'Your message' }), message);
  await user.click(screen.getByRole('button', { name: 'Send' }));
}

describe('FeedbackDialog (HML-44)', () => {
  let user: UserEvent;
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
  });

  it('shows the three feedback types with Bug preselected', () => {
    renderDialog();
    expect(screen.getByRole('radio', { name: 'Bug report' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Feature request' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Question' })).not.toBeChecked();
  });

  it('keeps the client message cap in sync with the server cap', () => {
    expect(FEEDBACK_MAX_MESSAGE_LENGTH).toBe(MAX_MESSAGE_LENGTH);
  });

  it('disables Send until a message is typed', async () => {
    renderDialog();
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Your message' }), 'hi');
    expect(send).toBeEnabled();
  });

  it('submits in-app: POSTs type + message + diagnostics and closes on success', async () => {
    fetchMock.mockResolvedValue(OK_RESPONSE());
    const onOpenChange = renderDialog();
    await user.click(screen.getByRole('radio', { name: 'Feature request' }));
    await fillAndSend(user, 'Add tide times');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/feedback');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(body.type).toBe('feature');
    expect(body.message).toBe('Add tide times');
    expect(body.website).toBe(''); // honeypot transmitted, empty for real users
    expect(body.diagnostics).toContain('App: Weather Whisperer');

    expect(onOpenChange).toHaveBeenCalledWith(false);
    // Message is cleared so a reopen starts fresh.
    expect(screen.getByRole('textbox', { name: 'Your message' })).toHaveValue('');
  });

  it('keeps the dialog open on failure so the message is not lost', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));
    const onOpenChange = renderDialog();
    await fillAndSend(user);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('carries an empty honeypot field for the server to check', () => {
    renderDialog();
    const honeypot = document.querySelector('input[name="website"]');
    expect(honeypot).not.toBeNull();
    expect(honeypot).toHaveValue('');
  });

  it('transmits a filled honeypot value so the server can drop bots', async () => {
    fetchMock.mockResolvedValue(OK_RESPONSE());
    renderDialog();
    // Simulate headless autofill: the field is display:none, so drive the
    // DOM directly instead of user-event.
    const honeypot = document.querySelector('input[name="website"]') as HTMLInputElement;
    fireEvent.change(honeypot, { target: { value: 'https://spam.example' } });
    await fillAndSend(user);

    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.website).toBe('https://spam.example');
  });

  it('gates Send on connectivity with an offline hint', async () => {
    renderDialog();
    await user.type(screen.getByRole('textbox', { name: 'Your message' }), 'offline report');

    // act: the connectivity listeners update state outside React's event
    // system, so flush before asserting.
    await act(async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('You are offline');

    await act(async () => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
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
    expect(screen.getByRole('textbox', { name: '你的訊息' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('描述遇到的問題，或想要的功能…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '傳送' })).toBeInTheDocument();
  });
});
