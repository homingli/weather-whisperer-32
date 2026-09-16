import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { OfflineIndicator } from './OfflineIndicator';
import { LanguageProvider } from '@/contexts/LanguageContext';

// The component reads `useOnlineStatus`, which initializes from
// `navigator.onLine` (true in jsdom) and then listens for window
// 'online'/'offline' events — dispatching those events is enough to flip it,
// no mocking needed. `act` wraps each dispatch because the listener fires a
// React state update that must flush before the assertions.
const goOffline = () => act(() => { window.dispatchEvent(new Event('offline')); });
const goOnline = () => act(() => { window.dispatchEvent(new Event('online')); });

const renderIndicator = () =>
  render(
    <LanguageProvider>
      <OfflineIndicator />
    </LanguageProvider>
  );

describe('OfflineIndicator Component', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders nothing while online', () => {
    const { container } = renderIndicator();
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the offline badge when the browser goes offline', () => {
    renderIndicator();
    goOffline();

    const badge = screen.getByRole('status');
    expect(badge).toHaveTextContent('Currently offline');
    expect(screen.getByTestId('offline-indicator')).toBeInTheDocument();
  });

  it('hides the badge when connectivity returns', () => {
    renderIndicator();
    goOffline();
    expect(screen.getByTestId('offline-indicator')).toBeInTheDocument();

    goOnline();
    expect(screen.queryByTestId('offline-indicator')).not.toBeInTheDocument();
  });

  it('initializes offline when navigator.onLine is false at mount', () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    try {
      renderIndicator();
      expect(screen.getByTestId('offline-indicator')).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('uses the Traditional Chinese string when the language is tc', () => {
    localStorage.setItem('weather-language', 'tc');
    renderIndicator();
    goOffline();

    expect(screen.getByRole('status')).toHaveTextContent('目前離線');
  });
});
