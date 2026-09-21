/** Direct-from-origin HTTP for the Capacitor native shells.
 *
 *  Two app resources are served through a same-origin proxy on the web —
 *  the Vite dev proxy in dev, a Vercel rewrite in prod — because their
 *  hosts send no Access-Control-Allow-Origin: the HKO gridded rainfall
 *  nowcast CSV (`/hko-data`) and the EPD AQHI RSS feed (`/aqhi-rss`).
 *  The native WebView (https://localhost on Android, capacitor://localhost
 *  on iOS) has no rewrite layer, so those proxy paths 404 there, and the
 *  WebView doesn't run service workers, so the workbox caches can't cover
 *  them either. Native code isn't subject to CORS, so on the native
 *  platforms we fetch the origin URLs directly via CapacitorHttp
 *  (HttpURLConnection / NSURLSession).
 *
 *  Deliberately NOT the global `CapacitorHttp: { enabled: true }` config
 *  patch: that reroutes every fetch and XHR in the app (MapLibre tiles,
 *  open-meteo, geocoding) through the JS↔native bridge and breaks
 *  streaming. Only these two proxy-dependent resources opt in.
 *
 *  Trade-offs vs the web streaming path (accepted):
 *  - No streaming: CapacitorHttp returns the full body in one shot, so
 *    download progress UI can't tick on native.
 *  - No AbortSignal: an in-flight native request can't be cancelled. The
 *    timeout below surfaces the error on schedule, but the losing HTTP
 *    request keeps running as a harmless orphan whose result is discarded.
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core';

/** True when running inside the iOS/Android shells (not a plain browser). */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export interface NativeTextResponse {
  status: number;
  text: string;
  /** Server Last-Modified as epoch ms, or 0 when absent/unparseable. */
  lastModified: number;
}

/** GET `url` on the native HTTP stack and return the body as text.
 *  Rejects on non-2xx status or when `timeoutMs` elapses. `timeoutMs`
 *  bounds both the initial connection and the total wait; the native
 *  readTimeout is an inactivity timeout, so a slow-drip server can still
 *  exceed it — but callers get their error at `timeoutMs` regardless. */
export async function nativeHttpGetText(
  url: string,
  timeoutMs: number,
): Promise<NativeTextResponse> {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timerId = setTimeout(
      () => reject(new DOMException(`Native fetch timed out after ${timeoutMs}ms`, 'TimeoutError')),
      timeoutMs,
    );
  });

  try {
    const response = await Promise.race([
      CapacitorHttp.get({
        url,
        responseType: 'text',
        readTimeout: timeoutMs,
        connectTimeout: Math.min(timeoutMs, 10_000),
      }),
      timeout,
    ]);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Native fetch failed: HTTP ${response.status}`);
    }
    // Native stacks return header keys in server casing ("Last-Modified");
    // look up case-insensitively rather than depending on platform quirks.
    const header = Object.entries(response.headers ?? {}).find(
      ([key]) => key.toLowerCase() === 'last-modified',
    );
    const parsed = header ? Date.parse(header[1]) : NaN;
    return {
      status: response.status,
      text: String(response.data),
      lastModified: Number.isNaN(parsed) ? 0 : parsed,
    };
  } finally {
    // If the HTTP side won the race, cancel the timer so its rejection
    // never lands on a promise nobody is awaiting. If the timer already
    // fired, clearing is a no-op and the HTTP orphan is left to finish.
    clearTimeout(timerId);
  }
}
