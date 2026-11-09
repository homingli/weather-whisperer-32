import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// The window mocks below only apply to DOM environments (jsdom). Node-env
// test files (e.g. api/feedback.test.ts) run the same global setup, where
// `window` does not exist — skip rather than crash them.
if (typeof window !== 'undefined') {
  // Mock localStorage
  const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value.toString();
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };
  })();

  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    configurable: true,
  });

  // Mock matchMedia. Defaults to matches: false on every query, which silently
  // encodes "wide viewport, light mode" for every test: LocalClock shows seconds
  // only on wide viewports (see Integration.test) and ThemeContext's
  // system-preference fallback resolves to light because of it. Stub per-test
  // (vi.stubGlobal / Object.defineProperty) if a test needs different matches.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    // configurable: under the vmThreads pool the jsdom window persists per
    // worker, so this setup re-runs per test file on the same window — each
    // re-define (and per-test re-stubs via vi.stubGlobal / defineProperty)
    // must be able to replace the previous definition.
    configurable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // Deprecated
      removeListener: vi.fn(), // Deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Mock ResizeObserver for Recharts
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  Object.defineProperty(window, 'ResizeObserver', {
    value: ResizeObserverMock,
    writable: true,
    configurable: true,
  });
}
