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
 *  - localStorage isn't a great place for multi-megabyte blobs; cap any
 *    single payload we attempt to persist and skip silently if it would
 *    overflow.
 */

import {
  PersistedClient,
  Persister,
} from '@tanstack/query-persist-client-core';

export const PERSIST_SCHEMA_VERSION = 'v1';
const STORAGE_KEY = `weather-rq-cache-${PERSIST_SCHEMA_VERSION}`;
const MAX_BYTES = 512 * 1024;

export const persister: Persister = {
  persistClient: async (client: PersistedClient) => {
    try {
      const json = JSON.stringify(client);
      if (json.length > MAX_BYTES) {
        // Drop quietly rather than risk a QuotaExceededError.
        return;
      }
      localStorage.setItem(STORAGE_KEY, json);
    } catch {
      // Storage quota / disabled storage — swallow.
    }
  },
  restoreClient: async () => {
    try {
      const json = localStorage.getItem(STORAGE_KEY);
      if (!json) return undefined;
      return JSON.parse(json) as PersistedClient;
    } catch {
      return undefined;
    }
  },
};
