/**
 * React Query persistence — serialize the query cache to localStorage so
 * a tab refresh doesn't always trigger a full network re-fetch. The
 * cold-start snapshot in `useWeatherWithProgress` still seeds React
 * Query on first paint; the persister kicks in on subsequent reloads
 * within `PERSIST_SCHEMA_VERSION`'s `maxAge`.
 *
 * Constraints:
 *  - Weather queries are bound to `[language, lat, lon]` query keys; the
 *    cached query for the user's exact selected city will be reused on
 *    reload, avoiding the post-reload FetchingStatus flash.
 *  - Bump `PERSIST_SCHEMA_VERSION` whenever the cached client's shape
 *    changes; TanStack compares it against `buster` in App.tsx and drops
 *    the cache on mismatch (one-line upgrade, no manual purge).
 *  - localStorage isn't a great place for multi-megabyte blobs; estimate
 *    size per-query before issuing the full serialize so we don't allocate
 *    a multi-MB string we'd then drop on the floor.
 */

import {
  PersistedClient,
  Persister,
} from '@tanstack/query-persist-client-core';

export const PERSIST_SCHEMA_VERSION = 'v1';
const STORAGE_KEY = `weather-rq-cache-${PERSIST_SCHEMA_VERSION}`;
const MAX_BYTES = 512 * 1024;

// Append here when bumping PERSIST_SCHEMA_VERSION so the prior key gets
// swept on next page load and doesn't orphan in localStorage forever.
// Currently empty — PERSIST_SCHEMA_VERSION is v1, the first public
// schema. On the next bump (e.g. v1 -> v2), prepend
// `weather-rq-cache-v1` here.
const LEGACY_STORAGE_KEYS: readonly string[] = [];

// Sweep legacy STORAGE_KEY entries once on module load. Safe to call
// repeatedly; removeItem is a no-op if the key is missing. Wrapped so a
// localStorage-disabled environment (private mode, SSR) doesn't throw.
try {
  for (const key of LEGACY_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }
} catch {
  // localStorage unavailable — ignore.
}

export const persister: Persister = {
  persistClient: async (client: PersistedClient) => {
    try {
      // Estimate before serialize. The bulk of PersistedClient is each
      // query's `state.data`; summing those individually caps per-call
      // allocation at MAX_BYTES and short-circuits before the final
      // concatenated stringify. A small fixed overhead per query accounts
      // for queryKey + queryHash + state metadata.
      let bytes = 64; // buster + timestamp + clientState overhead
      for (const q of client.queries) {
        bytes += JSON.stringify(q.queryKey).length + 128;
        if (q.state.data !== undefined) {
          bytes += JSON.stringify(q.state.data).length;
        }
        if (bytes > MAX_BYTES) {
          // Bail before final serialize — we already know we're over budget.
          return;
        }
      }
      const json = JSON.stringify(client);
      localStorage.setItem(STORAGE_KEY, json);
    } catch {
      // Storage quota / disabled storage — swallow (dev logging handled in
      // restoreClient below; persist failures are mostly benign).
    }
  },
  restoreClient: async () => {
    try {
      const json = localStorage.getItem(STORAGE_KEY);
      if (!json) return undefined;
      return JSON.parse(json) as PersistedClient;
    } catch (err) {
      // Disabled storage / parse error / stale schema. Log in dev only so
      // prod stays quiet but a CI re-run or local repro can inspect.
      if (import.meta.env.DEV) {
        console.debug('[queryPersist] restore failed', err);
      }
      return undefined;
    }
  },
  removeClient: async () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Disabled storage — ignore.
    }
  },
};
