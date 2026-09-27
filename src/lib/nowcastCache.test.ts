import { describe, it, expect, beforeEach, vi } from 'vitest';
import LZString from 'lz-string';
import {
  readNowcastCache,
  writeNowcastCache,
  touchNowcastCache,
  clearNowcastCache,
} from './nowcastCache';
import { NOWCAST_CACHE_SCHEMA_VERSION, STORAGE_KEYS, TIMING } from './constants';
import type { CellRow } from './rainfallGrid';

const sampleRows: CellRow[] = [
  { endTime: '202605171630', lat: 22.3119, lon: 114.1728, value: 1.5 },
  { endTime: '202605171700', lat: 22.3152, lon: 114.1801, value: 0.2 },
];

const V = NOWCAST_CACHE_SCHEMA_VERSION;

/** Compress with the same library the module uses, so seeded envelopes carry
 *  realistic rowsJson payloads without importing internals. */
function compressForSeed(text: string): string {
  return LZString.compress(text);
}

/** Seed an on-disk envelope directly (bypasses writeNowcastCache) so tests
 *  can store corrupt / stale / version-mismatched payloads. */
function seedEnvelope(overrides: Record<string, unknown>): void {
  localStorage.setItem(
    STORAGE_KEYS.NOWCAST_CACHE,
    JSON.stringify({
      v: V,
      cachedAt: Date.now(),
      rowsJson: compressForSeed(JSON.stringify(sampleRows)),
      updateTime: '2026-05-17 16:00',
      lastModified: 0,
      ...overrides,
    }),
  );
}

describe('nowcastCache', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  describe('writeNowcastCache / readNowcastCache round-trip', () => {
    it('stores rows compressed on disk and reads back equal', () => {
      const before = Date.now();
      writeNowcastCache(sampleRows, '2026-05-17 16:00', before);

      // The raw localStorage entry contains LZString output, not the JSON
      // rows — a lat from the sample must not appear verbatim.
      const raw = localStorage.getItem(STORAGE_KEYS.NOWCAST_CACHE);
      expect(raw).toBeTruthy();
      expect(raw).not.toContain('22.3119');

      const after = Date.now();
      const result = readNowcastCache();
      expect(result?.rows).toEqual(sampleRows);
      expect(result?.updateTime).toBe('2026-05-17 16:00');
      expect(result?.lastModified).toBe(before);
      expect(result?.cachedAt).toBeGreaterThanOrEqual(before);
      expect(result?.cachedAt).toBeLessThanOrEqual(after);

      const onDisk = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOWCAST_CACHE) ?? '{}');
      expect(onDisk.v).toBe(V);
    });

    it('produces a payload smaller than the raw JSON rows', () => {
      // Full-grid worst case: 58,564 rows (4 steps × 121×121 cells). Even
      // then compression must keep the entry well under the 5 MB quota.
      const rows: CellRow[] = [];
      for (let step = 0; step < 4; step++) {
        for (let r = 0; r < 121; r++) {
          for (let c = 0; c < 121; c++) {
            rows.push({
              endTime: `2026051716${(30 + step * 30).toString().padStart(4, '0')}`,
              lat: 22 + r * 0.01,
              lon: 114 + c * 0.01,
              value: Math.abs(Math.sin(r + c)) * 5,
            });
          }
        }
      }
      writeNowcastCache(rows, 't', 0);
      const raw = localStorage.getItem(STORAGE_KEYS.NOWCAST_CACHE) ?? '';
      const rawJson = JSON.stringify(rows);
      expect(raw.length).toBeLessThan(rawJson.length * 0.75);
      expect(raw.length).toBeLessThan(1_000_000); // quota headroom
    });

    it('overwrites a previous entry', () => {
      writeNowcastCache([{ endTime: 'a', lat: 1, lon: 2, value: 3 }], 't-A', 1);
      writeNowcastCache(sampleRows, 't-B', 2);
      expect(readNowcastCache()?.rows).toEqual(sampleRows);
      expect(readNowcastCache()?.updateTime).toBe('t-B');
    });

    it('does not throw when localStorage.setItem fails (quota / private mode)', () => {
      const setItemSpy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw new Error('QuotaExceededError');
        });
      expect(() => writeNowcastCache(sampleRows, 't', 0)).not.toThrow();
      setItemSpy.mockRestore();
    });
  });

  describe('readNowcastCache rejection paths', () => {
    it('returns null when nothing is stored', () => {
      expect(readNowcastCache()).toBeNull();
    });

    it('returns null when the cache is older than NOWCAST_CACHE_TTL_MS', () => {
      seedEnvelope({ cachedAt: Date.now() - TIMING.NOWCAST_CACHE_TTL_MS - 1 });
      expect(readNowcastCache()).toBeNull();
    });

    it('drops a v2 (csvText) envelope on read — schema bump', () => {
      // v2 stored an LZString-compressed CSV; after the v3 bump these must
      // be rejected (not mis-parsed) so the next mount re-fetches.
      seedEnvelope({ v: 2, rowsJson: undefined, csvText: 'fake compressed csv' });
      expect(readNowcastCache()).toBeNull();
    });    it('returns null for a version mismatch and does not throw', () => {
      seedEnvelope({ v: 999 });
      expect(readNowcastCache()).toBeNull();
    });

    it('returns null on JSON parse error', () => {
      localStorage.setItem(STORAGE_KEYS.NOWCAST_CACHE, '{ not json');
      expect(readNowcastCache()).toBeNull();
    });

    it('returns null when rowsJson is missing or the wrong type', () => {
      seedEnvelope({ rowsJson: undefined });
      expect(readNowcastCache()).toBeNull();
      seedEnvelope({ rowsJson: 42 });
      expect(readNowcastCache()).toBeNull();
    });

    it('returns null when cachedAt is the wrong type', () => {
      seedEnvelope({ cachedAt: 'yesterday' });
      expect(readNowcastCache()).toBeNull();
    });

    it('returns null when decompression fails (corrupt blob)', () => {
      // LZString.decompress returns '' for input it cannot decode; the
      // reader must bail instead of JSON-parsing garbage.
      seedEnvelope({ rowsJson: 'NORMALlzstringOUTPUT' });
      expect(readNowcastCache()).toBeNull();
    });

    it('returns null when decompressed rowsJson is not an array', () => {
      seedEnvelope({ rowsJson: compressForSeed('{"not":"an array"}') });
      expect(readNowcastCache()).toBeNull();
    });

    it('filters individual invalid rows instead of dropping the entry', () => {
      seedEnvelope({ rowsJson: compressForSeed(JSON.stringify([
        { endTime: '202605171630', lat: 22.3, lon: 114.1, value: 1.0 }, // valid
        { endTime: '', lat: 22.3, lon: 114.1, value: 1.0 }, // empty endTime
        { endTime: '202605171630', lat: 'x', lon: 114.1, value: 1.0 }, // bad lat
        { endTime: '202605171630', lat: 22.3, lon: 114.1, value: 'rain' }, // bad value
        null, // not an object
      ])) });
      const result = readNowcastCache();
      expect(result?.rows).toEqual([
        { endTime: '202605171630', lat: 22.3, lon: 114.1, value: 1.0 },
      ]);
    });
  });

  describe('touchNowcastCache', () => {
    it('refreshes cachedAt so a just-expired entry becomes fresh again', () => {
      // This is the HEAD-probe path: rows unchanged, TTL must restart.
      const staleCachedAt = Date.now() - TIMING.NOWCAST_CACHE_TTL_MS - 1;
      seedEnvelope({ cachedAt: staleCachedAt });
      expect(readNowcastCache()).toBeNull(); // expired

      touchNowcastCache();

      const result = readNowcastCache();
      expect(result).not.toBeNull();
      expect(result?.rows).toEqual(sampleRows);
      expect(result?.cachedAt).toBeGreaterThan(staleCachedAt);
    });

    it('preserves updateTime and lastModified when touching', () => {
      writeNowcastCache(sampleRows, '2026-05-17 16:00', 12345);
      touchNowcastCache();
      const result = readNowcastCache();
      expect(result?.updateTime).toBe('2026-05-17 16:00');
      expect(result?.lastModified).toBe(12345);
    });

    it('is a no-op when nothing is stored or the version mismatches', () => {
      expect(() => touchNowcastCache()).not.toThrow();
      seedEnvelope({ v: 999, cachedAt: Date.now() - TIMING.NOWCAST_CACHE_TTL_MS - 1 });
      // Must NOT refresh a version-mismatched entry into validity.
      touchNowcastCache();
      expect(readNowcastCache()).toBeNull();
    });
  });

  describe('clearNowcastCache', () => {
    it('removes the stored entry', () => {
      writeNowcastCache(sampleRows, 't', 0);
      expect(readNowcastCache()).not.toBeNull();
      clearNowcastCache();
      expect(readNowcastCache()).toBeNull();
    });

    it('is a no-op when nothing is stored', () => {
      expect(() => clearNowcastCache()).not.toThrow();
    });

    it('does not throw when localStorage.removeItem fails', () => {
      const removeItemSpy = vi
        .spyOn(Storage.prototype, 'removeItem')
        .mockImplementation(() => {
          throw new Error('disabled');
        });
      expect(() => clearNowcastCache()).not.toThrow();
      removeItemSpy.mockRestore();
    });
  });
});
