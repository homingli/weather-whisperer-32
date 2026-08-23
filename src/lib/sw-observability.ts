/**
 * Service worker lifecycle observability.
 *
 * The SW is registered by the script vite-plugin-pwa injects into the built
 * HTML (`registerSW.js`, fires on window load). Registration failures —
 * /sw.js 404 after a bad deploy, the vercel.json rewrite removed, a broken
 * workbox build — are silent: no exception reaches window.onerror, and users
 * quietly lose offline support or sit on a stale SW forever.
 *
 * This module observes the lifecycle and reports five events:
 *
 *   sw.unsupported       — 'serviceWorker' not in navigator (insecure context / old browser)
 *   sw.registered        — sw.ready resolved (baseline; denominator for error rates)
 *   sw.register-error    — sw.ready rejected, or did not settle within READY_TIMEOUT_MS
 *   sw.update-available  — registration received `updatefound` (new SW version discovered)
 *   sw.controller-changed— navigator.serviceWorker `controllerchange` fired
 *                          (updated SW took control; also fires on first visit)
 *
 * Stuck-update detection: high `sw.update-available` with low
 * `sw.controller-changed` means autoUpdate is not applying to users.
 *
 * The ready-watch (sw.ready + failure timer) is prod-only and armed on
 * window.load, which is when the injected registerSW.js actually calls
 * register(). Arming earlier (module eval) or in dev — where vite-plugin-pwa
 * is not configured with devOptions and no SW ever registers — would produce
 * false `sw.register-error` events.
 *
 * Reporting: dev → console via `logEvent`. Prod → Vercel Analytics custom
 * events via `track` (visible in the Vercel dashboard).
 */
import { track } from '@vercel/analytics';
import { logEvent } from '@/lib/log';

/**
 * How long to wait for sw.ready to settle before declaring registration
 * failed. The timer is armed at window.load (when registerSW.js calls
 * register()), and the budget must cover install: the workbox precache is
 * ~1.2 MB across 22 entries — on very slow 2G (~50 KB/s) that alone can
 * take ~24 s. 30 s is generous without delaying bad-deploy detection
 * unreasonably. The timer is the only failure signal — the injected
 * registerSW.js is fire-and-forget with no catch.
 */
const READY_TIMEOUT_MS = 30_000;

export type SwEventName =
  | 'sw.unsupported'
  | 'sw.registered'
  | 'sw.register-error'
  | 'sw.update-available'
  | 'sw.controller-changed';

/**
 * Report an SW lifecycle event. Always console-logs in dev; in prod also
 * emits a Vercel Analytics custom event. Never throws — observability must
 * not break the app.
 */
export function reportSwEvent(name: SwEventName, detail?: string): void {
  try {
    logEvent(name, detail ? { detail } : undefined);
    if (import.meta.env.PROD) {
      track(name, detail ? { detail } : {});
    }
  } catch {
    // Observability must never take the app down.
  }
}

/**
 * Start observing the service worker lifecycle. Call once from main.tsx
 * before render so registration failures are reported even when the app
 * itself renders fine.
 */
export function initSwObservability(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    reportSwEvent('sw.unsupported');
    return;
  }

  const sw = navigator.serviceWorker;

  // controllerchange fires both when an SW first takes control (first
  // visit) and when an updated SW replaces the controller (autoUpdate:
  // skipWaiting + clientsClaim in the generated sw.js). Kept outside the
  // prod gate — it is silent in dev (no SW is registered there).
  sw.addEventListener('controllerchange', () => reportSwEvent('sw.controller-changed'));

  // No SW in dev (vite.config.ts has no VitePWA devOptions): watching
  // sw.ready there would always end in a false register-error. Prod only.
  if (!import.meta.env.PROD) return;

  // sw.ready resolves only once a registration is active AND the page has
  // a controller. If it never settles — register() rejected, /sw.js failed
  // to install, or the injected register script never ran — the timer
  // reports it. Arm on window.load: that is when registerSW.js calls
  // register(); starting earlier can false-positive on slow connections,
  // where load fires long after the module evaluates.
  if (document.readyState === 'complete') {
    startReadyWatch(sw);
  } else {
    window.addEventListener('load', () => startReadyWatch(sw), { once: true });
  }
}

function startReadyWatch(sw: ServiceWorkerContainer): void {
  let settled = false;

  const failTimer = window.setTimeout(() => {
    if (!settled) {
      reportSwEvent('sw.register-error', `sw.ready did not settle within ${READY_TIMEOUT_MS}ms`);
    }
  }, READY_TIMEOUT_MS);

  sw.ready
    .then((reg) => {
      settled = true;
      window.clearTimeout(failTimer);
      reportSwEvent('sw.registered', reg.active?.scriptURL);
      // updatefound fires on this registration when a new SW version is
      // discovered. With registerType: 'autoUpdate' the new SW then
      // skipWaiting/claims on its own; controllerchange reports the cutover.
      reg.addEventListener('updatefound', () => reportSwEvent('sw.update-available'));
    })
    .catch((err: unknown) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(failTimer);
      reportSwEvent('sw.register-error', err instanceof Error ? err.message : String(err));
    });
}
