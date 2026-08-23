// Tests for the MSC nowcast idle prefetch.
//
// `prefetchMscNowcast` is one-shot per session (module-level flag) and
// network-gated, so each test re-imports the module fresh (vi.resetModules)
// and stubs the Image constructor to capture which URLs get warmed. jsdom
// has no requestIdleCallback, so the warm-up runs on the setTimeout(0)
// fallback — a macrotask tick later.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Keep the dynamic-import warm target hermetic — no leaflet/react-leaflet in
// the prefetch tests (MSCRainfallMap.test.tsx mocks react-leaflet itself).
vi.mock('@/components/MSCRainfallMapInner', () => ({ default: {} }));

import { shouldSkipPrefetch } from './msc-prefetch';

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

describe('prefetchMscNowcast', () => {
  /** URLs captured from the stubbed Image `.src` assignments. */
  let warmUrls: string[];

  class MockImage {
    crossOrigin = '';
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

  it('warms the 6 per-step probe tiles from the current run', async () => {
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

  it('is one-shot: a second call warms nothing new', async () => {
    const mod = await runPrefetch();
    const first = [...warmUrls];
    mod.prefetchMscNowcast();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warmUrls).toEqual(first);
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
});
