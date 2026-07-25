import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  readNowcastCache,
  writeNowcastCache,
  clearNowcastCache,
} from './nowcastCache';
import { NOWCAST_CACHE_SCHEMA_VERSION, STORAGE_KEYS, TIMING } from './constants';

const sampleCsv = `Updated Date and Time (in Hong Kong Time),Ending Date and Time (in Hong Kong Time),Latitude (degree),Longitude (degree),Half-hourly Nowcast Accumulated Rainfall (mm)
202605171600,202605171630,22.3119,114.1728,1.5
`;

describe('nowcastCache', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  describe('compression', () => {
    it('stores the csvText in compressed form on disk and decompresses on read', () => {
      writeNowcastCache(sampleCsv, 't', 0);

      // The raw localStorage entry contains LZString output, not the CSV.
      const raw = localStorage.getItem(STORAGE_KEYS.NOWCAST_CACHE);
      expect(raw).toBeTruthy();
      expect(raw).not.toContain('22.3119'); // raw CSV would contain this lat

      // Decompression on read returns the original CSV transparently.
      const result = readNowcastCache();
      expect(result?.csvText).toBe(sampleCsv);
    });

    it('produces a payload noticeably smaller than the raw CSV', () => {
      // Build a CSV large enough that compression ratio is meaningful.
      const lines = ['h1,h2,h3,h4,v'];
      for (let i = 0; i < 2000; i++) {
        lines.push(`202605171600,202605171630,22.31${i % 100},114.17${i % 100},${(i % 50).toFixed(1)}`);
      }
      const bigCsv = lines.join('\n');
      writeNowcastCache(bigCsv, 't', 0);
      const raw = localStorage.getItem(STORAGE_KEYS.NOWCAST_CACHE) ?? '';
      // Expect at least 25% reduction (LZString on redundant CSV typically 50%+).
      expect(raw.length).toBeLessThan(bigCsv.length * 0.75);
    });

    it('drops the entry when decompression returns empty (corrupt blob)', () => {
      // LZString.decompress returns null/"" for input it cannot decode at
      // all (e.g. chars outside its alphabet). Seed an envelope whose
      // csvText triggers that path.
      const envelope = {
        v: NOWCAST_CACHE_SCHEMA_VERSION,
        cachedAt: Date.now(),
        csvText: 'NORMALlzstringOUTPUT', // LZString returns null for this
        updateTime: 't',
        lastModified: 0,
      };
      localStorage.setItem(STORAGE_KEYS.NOWCAST_CACHE, JSON.stringify(envelope));
      expect(readNowcastCache()).toBeNull();
    });

    it('does not crash when LZString produces garbage (parser handles downstream)', () => {
      // LZString.decompress can return a truthy but garbage string for
      // some invalid inputs (verified by probe). We do NOT drop these;
      // the downstream CSV parser will fail to extract a grid and the
      // inner component falls back to a network fetch.
      const envelope = {
        v: NOWCAST_CACHE_SCHEMA_VERSION,
        cachedAt: Date.now(),
        csvText: 'this is not a valid lz-string blob',
        updateTime: 't',
        lastModified: 0,
      };
      localStorage.setItem(STORAGE_KEYS.NOWCAST_CACHE, JSON.stringify(envelope));
      expect(() => readNowcastCache()).not.toThrow();
      // Result is either null (if LZString caught it) or a non-null envelope
      // with garbage csvText (if LZString passed through). Both are safe.
      const result = readNowcastCache();
      if (result) expect(typeof result.csvText).toBe('string');
    });

    it('drops a v1 (uncompressed) envelope on read — schema bump', () => {
      // v1 stored raw CSV in csvText. After the bump to v2, the decompress
      // path would either fail or produce garbage; the version check must
      // reject these entries instead so they get re-fetched on next mount.
      const v1Envelope = {
        v: 1,
        cachedAt: Date.now(),
        csvText: sampleCsv, // raw CSV
        updateTime: 't',
        lastModified: 0,
      };
      localStorage.setItem(STORAGE_KEYS.NOWCAST_CACHE, JSON.stringify(v1Envelope));
      expect(readNowcastCache()).toBeNull();
    });

    it('round-trips a 1.5 MB realistic CSV without corruption', () => {
      // Simulate a realistic HKO CSV: 4 steps × 121×121 cells. Each row is
      // ~35 chars; total ≈ 2 MB of text.
      const lines = ['h1,h2,h3,h4,v'];
      for (let step = 0; step < 4; step++) {
        for (let r = 0; r < 121; r++) {
          for (let c = 0; c < 121; c++) {
            lines.push(`2026051716${step.toString().padStart(2, '0')},2026051716${(step + 1).toString().padStart(2, '0')},${(22 + r * 0.01).toFixed(4)},${(114 + c * 0.01).toFixed(4)},${(Math.sin(r + c) * 5).toFixed(1)}`);
          }
        }
      }
      const realistic = lines.join('\n');
      expect(realistic.length).toBeGreaterThan(1_000_000); // sanity

      writeNowcastCache(realistic, '2026-05-17 16:00', Date.now());
      const result = readNowcastCache();
      expect(result?.csvText).toBe(realistic);
      expect(result?.csvText.length).toBe(realistic.length);
    });
  });

  describe('readNowcastCache', () => {
    it('returns null when nothing is stored', () => {
      expect(readNowcastCache()).toBeNull();
    });

    it('returns the cached envelope when fresh', () => {
      writeNowcastCache(sampleCsv, '2026-05-17 16:00', Date.now());
      const result = readNowcastCache();
      expect(result).not.toBeNull();
      expect(result?.csvText).toBe(sampleCsv);
      expect(result?.updateTime).toBe('2026-05-17 16:00');
      expect(typeof result?.cachedAt).toBe('number');
      // On-disk envelope stores the schema version; the read shape doesn't
      // expose it (callers don't care, the version check is internal).
      const onDisk = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOWCAST_CACHE) ?? '{}');
      expect(onDisk.v).toBe(NOWCAST_CACHE_SCHEMA_VERSION);
    });

    it('returns null when the cache is older than NOWCAST_CACHE_TTL_MS', () => {
      // Seed the envelope with a cachedAt in the past, beyond the TTL window.
      const staleCachedAt = Date.now() - TIMING.NOWCAST_CACHE_TTL_MS - 1;
      const envelope = {
        v: NOWCAST_CACHE_SCHEMA_VERSION,
        cachedAt: staleCachedAt,
        csvText: sampleCsv,
        updateTime: '2026-05-17 16:00',
        lastModified: staleCachedAt,
      };
      localStorage.setItem(STORAGE_KEYS.NOWCAST_CACHE, JSON.stringify(envelope));
      expect(readNowcastCache()).toBeNull();
    });

    it('returns null for a version mismatch and does not throw', () => {
      const bad = {
        v: 999,
        cachedAt: Date.now(),
        csvText: sampleCsv,
        updateTime: 't',
        lastModified: 0,
      };
      localStorage.setItem(STORAGE_KEYS.NOWCAST_CACHE, JSON.stringify(bad));
      expect(readNowcastCache()).toBeNull();
    });

    it('returns null when cachedAt or csvText is missing', () => {
      localStorage.setItem(
        STORAGE_KEYS.NOWCAST_CACHE,
        JSON.stringify({
          v: NOWCAST_CACHE_SCHEMA_VERSION,
          updateTime: 't',
          lastModified: 0,
        })
      );
      expect(readNowcastCache()).toBeNull();
    });

    it('returns null on JSON parse error', () => {
      localStorage.setItem(STORAGE_KEYS.NOWCAST_CACHE, '{ not json');
      expect(readNowcastCache()).toBeNull();
    });

    it('returns null when csvText is the wrong type', () => {
      localStorage.setItem(
        STORAGE_KEYS.NOWCAST_CACHE,
        JSON.stringify({
          v: NOWCAST_CACHE_SCHEMA_VERSION,
          cachedAt: Date.now(),
          csvText: 42,
          updateTime: 't',
          lastModified: 0,
        })
      );
      expect(readNowcastCache()).toBeNull();
    });

    it('returns null when cachedAt is the wrong type', () => {
      localStorage.setItem(
        STORAGE_KEYS.NOWCAST_CACHE,
        JSON.stringify({
          v: NOWCAST_CACHE_SCHEMA_VERSION,
          cachedAt: 'yesterday',
          csvText: sampleCsv,
          updateTime: 't',
          lastModified: 0,
        })
      );
      expect(readNowcastCache()).toBeNull();
    });
  });

  describe('writeNowcastCache', () => {
    it('persists an envelope that reads back equal', () => {
      const before = Date.now();
      writeNowcastCache(sampleCsv, '2026-05-17 16:00', before);
      const after = Date.now();
      const result = readNowcastCache();
      expect(result).not.toBeNull();
      expect(result?.csvText).toBe(sampleCsv);
      expect(result?.cachedAt).toBeGreaterThanOrEqual(before);
      expect(result?.cachedAt).toBeLessThanOrEqual(after);
    });

    it('overwrites a previous entry', () => {
      writeNowcastCache('csv-A', 't-A', 1);
      writeNowcastCache('csv-B', 't-B', 2);
      expect(readNowcastCache()?.csvText).toBe('csv-B');
    });

    it('does not throw when localStorage.setItem fails (quota / private mode)', () => {
      const setItemSpy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw new Error('QuotaExceededError');
        });
      expect(() => writeNowcastCache(sampleCsv, 't', 0)).not.toThrow();
      setItemSpy.mockRestore();
    });
  });

  describe('clearNowcastCache', () => {
    it('removes the stored envelope', () => {
      writeNowcastCache(sampleCsv, 't', 0);
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