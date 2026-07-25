/** localStorage cache for the HKO gridded rainfall nowcast CSV.
 *
 *  The CSV is ~2.7 MB raw. We LZString-compress it before storing so the
 *  localStorage footprint drops from ~2.7 MB to ~1.0-1.2 MB (~55-60%
 *  reduction on the highly structured numeric CSV), keeping us clear of the
 *  5 MB shared quota with the rest of the app's keys. Compression is sync
 *  (no async round-trip on the critical mount path) and free on read since
 *  the saved JSON.parse cost roughly equals the decompression cost.
 *
 *  Schema-versioned envelope (same pattern as `storage.ts` last-known
 *  weather). v2 introduces the LZString-compressed csvText field; v1
 *  entries (raw CSV) are dropped on read instead of silently failed.
 *
 *  localStorage failures (private mode, quota) are non-fatal: we silently
 *  drop the write and the app falls back to the existing network-first path.
 */

import LZString from 'lz-string';
import { NOWCAST_CACHE_SCHEMA_VERSION, STORAGE_KEYS, TIMING } from './constants';
import { logWarn } from './log';

export type NowcastCacheEnvelope = {
  v: typeof NOWCAST_CACHE_SCHEMA_VERSION;
  /** Epoch ms when the CSV was written to localStorage. */
  cachedAt: number;
  /** CSV text in the form expected by `parseRainfallCSVText`. The on-disk
   *  shape stores this LZString-compressed; `readNowcastCache` decompresses
   *  before returning so callers always see raw CSV. */
  csvText: string;
  /** Parsed update-time string ("YYYY-MM-DD HH:mm"), surfaced in the UI. */
  updateTime: string;
  /** HTTP Last-Modified header epoch ms. Reserved for future adaptive
   *  refetch logic; the current scheduler uses cachedAt + TTL instead. */
  lastModified: number;
};

/**
 * Read the cached nowcast CSV, or null if absent / stale / corrupt /
 * version-mismatched. Returns the **decompressed** CSV in `csvText` so the
 * caller doesn't need to know about the on-disk compression format.
 */
export function readNowcastCache(): NowcastCacheEnvelope | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEYS.NOWCAST_CACHE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as NowcastCacheEnvelope;
    if (!parsed || parsed.v !== NOWCAST_CACHE_SCHEMA_VERSION) {
      logWarn(`[nowcastCache] dropped: version mismatch (got ${parsed?.v ?? 'missing'})`);
      return null;
    }
    if (typeof parsed.cachedAt !== 'number' || typeof parsed.csvText !== 'string') {
      logWarn('[nowcastCache] dropped: missing cachedAt or csvText');
      return null;
    }
    if (Date.now() - parsed.cachedAt > TIMING.NOWCAST_CACHE_TTL_MS) {
      // Stale. Don't log — the user just navigated back after a while.
      return null;
    }
    // LZString.decompress returns '' for both empty input and corrupt
    // (non-LZString) input — exactly the signal we want to bail on.
    const csvText = LZString.decompress(parsed.csvText);
    if (!csvText) {
      logWarn('[nowcastCache] dropped: decompression failed (corrupt entry)');
      return null;
    }
    return { ...parsed, csvText };
  } catch (err) {
    logWarn('[nowcastCache] dropped: JSON parse error', err);
    return null;
  }
}

/** Persist a successful nowcast fetch. The CSV is LZString-compressed
 *  before writing so the on-disk envelope is ~half the raw size. Failures
 *  (quota, private mode) are swallowed so the network path is unaffected. */
export function writeNowcastCache(
  csvText: string,
  updateTime: string,
  lastModified: number,
): void {
  if (typeof window === 'undefined') return;
  try {
    // LZString.compress returns '' for empty input; treat that as a no-op.
    const compressed = LZString.compress(csvText);
    if (!compressed) return;
    const envelope: NowcastCacheEnvelope = {
      v: NOWCAST_CACHE_SCHEMA_VERSION,
      cachedAt: Date.now(),
      csvText: compressed,
      updateTime,
      lastModified,
    };
    window.localStorage.setItem(STORAGE_KEYS.NOWCAST_CACHE, JSON.stringify(envelope));
  } catch {
    // localStorage may be full (1+ MB compressed CSV + 5 MB quota headroom
    // is comfortable but still tight on Safari) or disabled (private mode).
    // Failure is non-fatal.
  }
}

/** Remove the cached CSV. No-op when nothing is stored. */
export function clearNowcastCache(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEYS.NOWCAST_CACHE);
  } catch {
    // ignore
  }
}