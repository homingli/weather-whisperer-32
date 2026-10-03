/** localStorage cache for the HKO gridded rainfall nowcast — sparse v3.
 *
 *  v3 stores the PARSED rain-only rows instead of the raw CSV text. The live
 *  CSV is dense — 98.8% of its ~58k rows are `0.00` on a dry day (measured
 *  2026-09-28, HML-43) — because HKO publishes the full 121×121 cell grid
 *  regardless of rain. `parseRainfallCSVText` already drops those zeros, so
 *  persisting its output rather than its input gives:
 *
 *    - ~10×+ smaller localStorage footprint (dry day: ~1.1 MB compressed CSV
 *      → a few KB of rows; worst-case soaker with every cell raining is still
 *      bounded by the 58,564-row grid and compresses to a few hundred KB).
 *    - Near-zero compress cost on write (was 300-800 ms main-thread LZString
 *      on the 2.7 MB CSV on low-end mobile).
 *    - Cache-hit mounts skip the 58k-line `split('\n')` + re-parse entirely
 *      and go straight to `buildRainGrid`.
 *
 *  Schema-versioned envelope (same pattern as `storage.ts` last-known
 *  weather). v2 entries (compressed csvText) and v1 (raw CSV) drop on read
 *  and re-fetch from the network.
 *
 *  localStorage failures (private mode, quota) are non-fatal: we silently
 *  drop the write and the app falls back to the existing network-first path.
 *
 *  Two types to keep the on-disk and in-memory shapes from leaking:
 *    - `NowcastCacheEnvelope` is what JSON.stringify produces; rowsJson is
 *      LZString-compressed. Used only inside this module + the test file.
 *    - `NowcastCacheRead` is what `readNowcastCache` returns; rows are
 *      plain `CellRow[]` ready for `buildRainGrid`.
 */

import LZString from 'lz-string';
import { NOWCAST_CACHE_SCHEMA_VERSION, STORAGE_KEYS, TIMING } from './constants';
import type { CellRow } from './rainfallGrid';
import { logWarn } from './log';

/** On-disk shape: what's stored in localStorage. `rowsJson` is compressed. */
export type NowcastCacheEnvelope = {
  v: typeof NOWCAST_CACHE_SCHEMA_VERSION;
  /** Epoch ms when the snapshot was written (or last touched). */
  cachedAt: number;
  /** LZString-compressed JSON of rain-only CellRow[]. */
  rowsJson: string;
  /** Parsed update-time string ("YYYY-MM-DD HH:mm"), surfaced in the UI. */
  updateTime: string;
  /** HTTP Last-Modified header epoch ms of the source CSV. Consumed by the
   *  HEAD freshness probe before background refetches (HML-43): when the
   *  header matches, the scheduled refetch skips the ~380 KB download. */
  lastModified: number;
};

/** In-memory shape: what `readNowcastCache` returns. */
export type NowcastCacheRead = {
  /** Epoch ms when the snapshot was written (or last touched). */
  cachedAt: number;
  /** Rain-only rows (zeros dropped at parse) — ready for `buildRainGrid`. */
  rows: CellRow[];
  /** Parsed update-time string ("YYYY-MM-DD HH:mm"). */
  updateTime: string;
  /** HTTP Last-Modified header epoch ms. 0 when the header was missing on
   *  the fetch that wrote this entry (disables the HEAD freshness probe). */
  lastModified: number;
};

/** Shape-check one parsed row. A corrupt/garbage entry must degrade to
 *  "no cache", not poison `buildRainGrid` with NaN keys. */
function isValidRow(r: unknown): r is CellRow {
  if (typeof r !== 'object' || r === null) return false;
  const row = r as Record<string, unknown>;
  return (
    typeof row.endTime === 'string' &&
    row.endTime.length > 0 &&
    typeof row.lat === 'number' && Number.isFinite(row.lat) &&
    typeof row.lon === 'number' && Number.isFinite(row.lon) &&
    typeof row.value === 'number' && Number.isFinite(row.value)
  );
}

/**
 * Read the cached nowcast snapshot, or null if absent / stale / corrupt /
 * version-mismatched. Returns the **decompressed** rain-only rows so the
 * caller can go straight to `buildRainGrid`.
 */
export function readNowcastCache(): NowcastCacheRead | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEYS.NOWCAST_CACHE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as NowcastCacheEnvelope;
    if (!parsed || parsed.v !== NOWCAST_CACHE_SCHEMA_VERSION) {
      logWarn(`[nowcastCache] dropped: version mismatch (got ${parsed?.v ?? 'missing'})`);
      return null;
    }
    if (typeof parsed.cachedAt !== 'number' || typeof parsed.rowsJson !== 'string') {
      logWarn('[nowcastCache] dropped: missing cachedAt or rowsJson');
      return null;
    }
    if (Date.now() - parsed.cachedAt > TIMING.NOWCAST_CACHE_TTL_MS) {
      // Stale. Don't log — the user just navigated back after a while.
      return null;
    }
    // LZString.decompress returns '' for both empty input and corrupt
    // (non-LZString) input — exactly the signal we want to bail on.
    const rowsRaw = LZString.decompress(parsed.rowsJson);
    if (!rowsRaw) {
      logWarn('[nowcastCache] dropped: decompression failed (corrupt entry)');
      return null;
    }
    const rowsUnknown: unknown = JSON.parse(rowsRaw);
    if (!Array.isArray(rowsUnknown)) {
      logWarn('[nowcastCache] dropped: rowsJson is not an array');
      return null;
    }
    // Filter rather than reject: one corrupt row shouldn't nuke an
    // otherwise-usable snapshot. (We wrote this entry ourselves, so garbage
    // here means storage corruption — the filter is a cheap safety net.)
    const rows = rowsUnknown.filter(isValidRow);
    return {
      cachedAt: parsed.cachedAt,
      rows,
      // Degrad corrupt metadata instead of surfacing it: an empty stamp just
      // hides the UI "updated" line; lastModified 0 disables the HEAD probe
      // so the next refetch does a full GET (always safe, just slower).
      updateTime: typeof parsed.updateTime === 'string' ? parsed.updateTime : '',
      lastModified: typeof parsed.lastModified === 'number' ? parsed.lastModified : 0,
    };
  } catch (err) {
    logWarn('[nowcastCache] dropped: JSON parse error', err);
    return null;
  }
}

/** Persist a successful nowcast fetch. The rain-only rows are LZString-
 *  compressed before writing — cheap even at full-grid worst case, unlike
 *  the 2.7 MB CSV this module stored before v3. Failures (quota, private
 *  mode) are swallowed so the network path is unaffected.
 *
 *  Synchronous. Use only when immediate persistence is required (tests).
 *  For the production fetch path, use `scheduleCacheWrite` so the work
 *  happens after the React commit that releases the map lock. */
export function writeNowcastCache(
  rows: CellRow[],
  updateTime: string,
  lastModified: number,
): void {
  if (typeof window === 'undefined') return;
  try {
    // LZString.compress returns '' for empty input; treat that as a no-op.
    const rowsJson = LZString.compress(JSON.stringify(rows));
    if (!rowsJson) return;
    const envelope: NowcastCacheEnvelope = {
      v: NOWCAST_CACHE_SCHEMA_VERSION,
      cachedAt: Date.now(),
      rowsJson,
      updateTime,
      lastModified,
    };
    window.localStorage.setItem(STORAGE_KEYS.NOWCAST_CACHE, JSON.stringify(envelope));
  } catch {
    // localStorage may be full or disabled (private mode). Failure is
    // non-fatal.
  }
}

/**
 * Refresh the cached snapshot's `cachedAt` without rewriting the payload.
 * Called when the HEAD freshness probe proves the source CSV unchanged: the
 * rows are still current, but the 15-min TTL must restart so the next mount
 * keeps hitting the cache instead of re-downloading. No decompress and no
 * recompress — just an envelope field flip.
 */
export function touchNowcastCache(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.NOWCAST_CACHE);
    if (!raw) return;
    const parsed = JSON.parse(raw) as NowcastCacheEnvelope;
    if (!parsed || parsed.v !== NOWCAST_CACHE_SCHEMA_VERSION) return;
    parsed.cachedAt = Date.now();
    window.localStorage.setItem(STORAGE_KEYS.NOWCAST_CACHE, JSON.stringify(parsed));
  } catch {
    // Non-fatal: a failed touch just means the next mount re-fetches.
  }
}

/**
 * Defer the LZString compression + localStorage write to a low-priority
 * idle slot so the React commit that releases the rainfall map lock isn't
 * blocked by compression work. (v3 keeps this deferral even though the
 * payload is now small — it's free and preserves the old guarantee.)
 *
 * The rows sit in a module-scoped slot rather than being captured in
 * the idle callback's closure. This coalesces concurrent schedules: at
 * most one snapshot is pinned at a time, instead of N concurrent
 * schedules each pinning their own copy until each idle fires.
 */
export function scheduleCacheWrite(
  rows: CellRow[],
  updateTime: string,
  lastModified: number,
): void {
  if (typeof window === 'undefined') return;
  pendingWrite = { rows, updateTime, lastModified };
  if (window.requestIdleCallback) {
    window.requestIdleCallback(drainPendingWrite, { timeout: 5000 });
  } else {
    setTimeout(drainPendingWrite, 0);
  }
}

/** Module-scoped holder for the next pending cache write. Replaces the
 *  closure-capture approach so the snapshot doesn't get pinned across
 *  the idle boundary. */
let pendingWrite: { rows: CellRow[]; updateTime: string; lastModified: number } | null = null;

/** Idle-callback target: pop the slot, release the reference, then run the
 *  write. If a second scheduleCacheWrite landed while we were idle, it
 *  overwrites pendingWrite and this drain picks up the latest one. */
function drainPendingWrite(): void {
  const item = pendingWrite;
  pendingWrite = null;
  if (item) writeNowcastCache(item.rows, item.updateTime, item.lastModified);
}

/** Remove the cached snapshot. No-op when nothing is stored. */
export function clearNowcastCache(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEYS.NOWCAST_CACHE);
  } catch {
    // ignore
  }
}
