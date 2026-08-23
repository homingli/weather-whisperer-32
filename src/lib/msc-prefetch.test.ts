// Tests for the MSC nowcast idle prefetch.
//
// `prefetchMscNowcast` is one-shot per session (module-level flag) and
// network/device-gated, so each test re-imports the module fresh
// (vi.resetModules) and stubs the Image constructor to capture which URLs get
// warmed. jsdom has no requestIdleCallback, so the warm-up runs on the
// setTimeout(0) fallback — a macrotask tick later.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Keep the dynamic-import warm target hermetic — no leaflet/react-leaflet in
// the prefetch tests (MSCRainfallMap.test.tsx mocks react-leaflet itself).
vi.mock('@/components/MSCRainfallMapInner', () => ({ default: {} }));

import { shouldSkipPrefetch, planMscPrefetch } from './msc-prefetch';

describe('shouldSkipPrefetch', () => {
  it('prefetches by default when connection info is unavailable', () => {
    expect(shouldSkipPrefetch()).toBe(false);
    expect(shouldSkipPrefetch(null)).toBe(false);
    expect(shouldSkipPrefetch(undefined)).toBe(false);
  });

  it('skips when the user has enabled data saving', () => {
    expect(shouldSkipPrefetch({ saveData: true, effectiveType: '4g' })).toBe(true);
  });

  it('skips on 2g / slow-2g but prefetches on 3g and 4g', () => {
    expect(shouldSkipPrefetch({ effectiveType: 'slow-2g' })).toBe(true);
    expect(shouldSkipPrefetch({ effectiveType: '2g' })).toBe(true);
    expect(shouldSkipPrefetch({ effectiveType: '3g' })).toBe(false);
    expect(shouldSkipPrefetch({ effectiveType: '4g' })).toBe(false);
  });
});

describe('planMscPrefetch', () => {
  it('never warms on a constrained connection, regardless of pointer', () => {
    expect(planMscPrefetch({ effectiveType: '2g' }, false)).toBe('none');
    expect(planMscPrefetch({ effectiveType: '2g' }, true)).toBe('none');
    expect(planMscPrefetch({ saveData: true, effectiveType: '4g' }, false)).toBe('none');
  });

  it('warms full on desktop (fine pointer), even without connection info', () => {
    expect(planMscPrefetch(undefined, false)).toBe('full');
    expect(planMscPrefetch({ effectiveType: '4g' }, false)).toBe('full');
  });

  it('reduces to the active step only on coarse-pointer devices (ANY engine)', () => {
    // Safari/Firefox have no navigator.connection — the coarse-pointer tier
    // must cap the data budget there too, not just on Chromium.
    expect(planMscPrefetch(undefined, true)).toBe('reduced');
    expect(planMscPrefetch({ effectiveType: '4g' }, true)).toBe('reduced');
  });
});

describe('prefetchMscNowcast', () => {
  /** URLs captured from the stubbed Image `.src` assignments. */
  let warmUrls: string[];
  /** Restores the setup.ts matchMedia mock after a coarse-pointer test. */
  let restoreMatchMedia: (() => void) | null = null;

  class MockImage {
    crossOrigin = '';
    onerror: (() => void) | null = null;
    private _src = '';
    get src(): string {
      return this._src;
    }
    set src(url: string) {
      this._src = url;
      warmUrls.push(url);
    }
  }

  beforeEach(() => {
    vi.resetModules();
    warmUrls = [];
    vi.stubGlobal('Image', MockImage);
  });

  afterEach(() => {
    restoreMatchMedia?.();
    restoreMatchMedia = null;
    vi.unstubAllGlobals();
    // jsdom's navigator has no `connection`; remove it when a test added it.
    delete (navigator as unknown as Record<string, unknown>).connection;
  });

  /** Re-import the module (fresh one-shot flag) and flush the idle callback. */
  async function runPrefetch(): Promise<typeof import('./msc-prefetch')> {
    const mod = await import('./msc-prefetch');
    mod.prefetchMscNowcast();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return mod;
  }

  /** jsdom's setup mock reports matches:false; force a coarse-pointer viewport. */
  function stubCoarsePointer(): void {
    const original = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(pointer: coarse)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    restoreMatchMedia = () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: original,
      });
    };
  }

  it('warms the 6 per-step probe tiles from the current run on desktop (full tier)', async () => {
    await runPrefetch();
    expect(warmUrls).toHaveLength(6);
    for (const url of warmUrls) {
      expect(url.startsWith('https://geo.weather.gc.ca/geomet?')).toBe(true);
      expect(url).toContain('request=GetMap');
      // Steps are strict MapServer instants (the map's probe fetches the
      // exact same URLs — warmed entries must match byte-for-byte). The
      // colons are URL-encoded (%3A) by buildProbeUrl.
      expect(url).toMatch(/time=\d{4}-\d{2}-\d{2}T\d{2}%3A00%3A00Z$/);
    }
    // All 6 steps are distinct hours.
    const times = warmUrls.map((u) => u.match(/time=(.+)$/)?.[1]);
    expect(new Set(times).size).toBe(6);
  });

  it('warms only the active step on coarse-pointer devices (reduced tier)', async () => {
    stubCoarsePointer();
    await runPrefetch();
    expect(warmUrls).toHaveLength(1);
  });

  it('warms only the active step on coarse pointer even with a good connection (Chromium mobile)', async () => {
    stubCoarsePointer();
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: false, effectiveType: '4g' },
      configurable: true,
    });
    await runPrefetch();
    expect(warmUrls).toHaveLength(1);
  });

  it('skips the warm-up entirely when saveData is set', async () => {
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: true, effectiveType: '4g' },
      configurable: true,
    });
    await runPrefetch();
    expect(warmUrls).toHaveLength(0);
  });

  it('skips the warm-up on a 2g connection', async () => {
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: false, effectiveType: '2g' },
      configurable: true,
    });
    await runPrefetch();
    expect(warmUrls).toHaveLength(0);
  });

  it('does not duplicate probe fetches once the map has mounted', async () => {
    const mod = await import('./msc-prefetch');
    mod.markMscMapMounted(); // the map is live and fetching its own tiles
    mod.prefetchMscNowcast();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warmUrls).toHaveLength(0);
  });

  it('is one-shot: a second call warms nothing new', async () => {
    const mod = await runPrefetch();
    const first = [...warmUrls];
    mod.prefetchMscNowcast();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warmUrls).toEqual(first);
  });
});
