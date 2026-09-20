import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initSwObservability, reportSwEvent } from './sw-observability';
import { logEvent } from '@/lib/log';
import { track } from '@vercel/analytics';

vi.mock('@/lib/log', () => ({
  logEvent: vi.fn(),
}));
vi.mock('@vercel/analytics', () => ({
  track: vi.fn(),
}));

const mockedLogEvent = vi.mocked(logEvent);
const mockedTrack = vi.mocked(track);

type Listener = (ev: Event) => void;

/** Minimal ServiceWorkerRegistration double. */
function makeRegistration() {
  const listeners: Record<string, Listener[]> = {};
  return {
    active: { scriptURL: 'https://weather.hmli.fyi/sw.js' },
    addEventListener: vi.fn((type: string, cb: Listener) => {
      (listeners[type] ??= []).push(cb);
    }),
    emit: (type: string) => listeners[type]?.forEach((cb) => cb(new Event(type))),
  };
}

/** Minimal ServiceWorkerContainer double. */
function makeContainer(ready: Promise<ReturnType<typeof makeRegistration>>) {
  const listeners: Record<string, Listener[]> = {};
  return {
    ready,
    addEventListener: vi.fn((type: string, cb: Listener) => {
      (listeners[type] ??= []).push(cb);
    }),
    emit: (type: string) => listeners[type]?.forEach((cb) => cb(new Event(type))),
  };
}

function stubServiceWorker(container: unknown): void {
  Object.defineProperty(window.navigator, 'serviceWorker', {
    value: container,
    configurable: true,
  });
}

/** Force a deterministic document readyState (jsdom default is 'complete'). */
function setReadyState(state: DocumentReadyState): void {
  Object.defineProperty(document, 'readyState', {
    value: state,
    configurable: true,
  });
}

function loggedEvents(name?: string): Array<Record<string, unknown> | undefined> {
  return mockedLogEvent.mock.calls
    .filter(([event]) => event === name)
    .map(([, props]) => props);
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  delete (window.navigator as { serviceWorker?: unknown }).serviceWorker;
});

describe('reportSwEvent', () => {
  it('logs to console in dev and does not call track', () => {
    reportSwEvent('sw.registered', 'https://example.com/sw.js');
    expect(mockedLogEvent).toHaveBeenCalledWith('sw.registered', {
      detail: 'https://example.com/sw.js',
    });
    expect(mockedTrack).not.toHaveBeenCalled();
  });

  it('emits a Vercel Analytics event in prod', () => {
    vi.stubEnv('PROD', true);
    reportSwEvent('sw.register-error', 'boom');
    expect(mockedTrack).toHaveBeenCalledWith('sw.register-error', { detail: 'boom' });
    expect(mockedLogEvent).toHaveBeenCalledWith('sw.register-error', { detail: 'boom' });
  });

  it('sends an empty props object in prod when there is no detail', () => {
    vi.stubEnv('PROD', true);
    reportSwEvent('sw.update-available');
    expect(mockedTrack).toHaveBeenCalledWith('sw.update-available', {});
  });

  it('never throws even if the sink throws', () => {
    mockedTrack.mockImplementation(() => {
      throw new Error('sink down');
    });
    vi.stubEnv('PROD', true);
    expect(() => reportSwEvent('sw.controller-changed')).not.toThrow();
  });
});

describe('initSwObservability', () => {
  it('reports sw.unsupported when serviceWorker is not available (jsdom default)', () => {
    expect('serviceWorker' in window.navigator).toBe(false);
    initSwObservability();
    expect(mockedLogEvent).toHaveBeenCalledWith('sw.unsupported', undefined);
  });

  it('reports sw.registered with the active script URL once sw.ready settles', async () => {
    vi.stubEnv('PROD', true);
    setReadyState('complete');
    const container = makeContainer(Promise.resolve(makeRegistration()));
    stubServiceWorker(container);

    initSwObservability();
    await flushPromises();

    expect(mockedLogEvent).toHaveBeenCalledWith('sw.registered', {
      detail: 'https://weather.hmli.fyi/sw.js',
    });
    expect(loggedEvents('sw.register-error')).toHaveLength(0);
  });

  it('reports sw.update-available when the registration fires updatefound', async () => {
    vi.stubEnv('PROD', true);
    setReadyState('complete');
    const reg = makeRegistration();
    const container = makeContainer(Promise.resolve(reg));
    stubServiceWorker(container);

    initSwObservability();
    await flushPromises();
    mockedLogEvent.mockClear();

    reg.emit('updatefound');

    expect(mockedLogEvent).toHaveBeenCalledWith('sw.update-available', undefined);
  });

  it('reports sw.controller-changed when the container fires controllerchange', async () => {
    const container = makeContainer(Promise.resolve(makeRegistration()));
    stubServiceWorker(container);

    initSwObservability();
    await flushPromises();
    mockedLogEvent.mockClear();

    container.emit('controllerchange');

    expect(mockedLogEvent).toHaveBeenCalledWith('sw.controller-changed', undefined);
  });

  it('reports sw.register-error when sw.ready rejects', async () => {
    vi.stubEnv('PROD', true);
    setReadyState('complete');
    const container = makeContainer(
      Promise.reject(new Error('registration rejected')) as Promise<ReturnType<typeof makeRegistration>>,
    );
    stubServiceWorker(container);

    initSwObservability();
    await flushPromises();

    expect(loggedEvents('sw.register-error')).toEqual([
      { detail: 'registration rejected' },
    ]);
  });

  it('reports sw.register-error when sw.ready never settles (fake timers)', () => {
    vi.stubEnv('PROD', true);
    setReadyState('complete');
    const container = makeContainer(new Promise<ReturnType<typeof makeRegistration>>(() => {}));
    stubServiceWorker(container);
    vi.useFakeTimers();

    initSwObservability();
    expect(loggedEvents('sw.register-error')).toHaveLength(0);

    vi.advanceTimersByTime(30_000);

    expect(loggedEvents('sw.register-error')).toHaveLength(1);
    expect(String(loggedEvents('sw.register-error')[0]?.detail)).toContain(
      'sw.ready did not settle'
    );
  });

  it('does not arm the ready-watch until window load', () => {
    vi.stubEnv('PROD', true);
    setReadyState('loading');
    const container = makeContainer(new Promise<ReturnType<typeof makeRegistration>>(() => {}));
    stubServiceWorker(container);
    vi.useFakeTimers();

    initSwObservability();

    // Timer budget passes before load: nothing may fire yet — register()
    // (and therefore sw.ready) has not even started.
    vi.advanceTimersByTime(30_000);
    expect(loggedEvents('sw.register-error')).toHaveLength(0);

    window.dispatchEvent(new Event('load'));
    vi.advanceTimersByTime(30_000);
    expect(loggedEvents('sw.register-error')).toHaveLength(1);
  });

  it('does not watch sw.ready in dev (no SW is registered there)', () => {
    setReadyState('complete');
    const container = makeContainer(new Promise<ReturnType<typeof makeRegistration>>(() => {}));
    stubServiceWorker(container);
    vi.useFakeTimers();

    initSwObservability();
    vi.advanceTimersByTime(30_000);

    expect(loggedEvents('sw.register-error')).toHaveLength(0);
    expect(loggedEvents('sw.registered')).toHaveLength(0);
  });

  it('does not report sw.register-error after sw.ready settles late', async () => {
    vi.stubEnv('PROD', true);
    setReadyState('complete');
    let resolveReady: (reg: ReturnType<typeof makeRegistration>) => void = () => {};
    const container = makeContainer(
      new Promise<ReturnType<typeof makeRegistration>>((resolve) => {
        resolveReady = resolve;
      }),
    );
    stubServiceWorker(container);
    vi.useFakeTimers();

    initSwObservability();

    // Settle just before the timeout fires. Await a microtask tick so the
    // sw.ready .then (settled = true + clearTimeout) runs before the
    // remaining timer budget advances — with fake timers, pending
    // microtasks do not run while the test stays synchronous.
    vi.advanceTimersByTime(29_000);
    resolveReady(makeRegistration());
    await Promise.resolve();
    vi.advanceTimersByTime(1_000);

    expect(loggedEvents('sw.register-error')).toHaveLength(0);
  });
});
