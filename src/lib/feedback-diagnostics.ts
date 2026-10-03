/**
 * Device diagnostics for user feedback (HML-44).
 *
 * Feedback reaches the maintainer as a plain email (the Linear SUPPORT
 * team's intake address — see feedback.ts), so this module renders the
 * device context a user can't be relied on to describe — app build,
 * display mode, viewport, platform — into a compact text block that is
 * either attached to the prefilled mailto body or copied to the clipboard.
 *
 * The keys stay in English regardless of UI language: the block is read by
 * the developer, not the user, and stable keys keep triage scannable.
 */

function isStandalone(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  const standaloneQuery = window.matchMedia('(display-mode: standalone)');
  // iOS Safari has no display-mode support; it exposes navigator.standalone.
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standaloneQuery.matches || iosStandalone;
}

/**
 * Collect the device context and render it as a plain-text block, ready
 * for a mailto body or the clipboard. Never throws — an exotic webview
 * missing an API degrades the whole block to a one-line marker rather
 * than breaking the feedback flow.
 */
export function collectFeedbackDiagnostics(language: string): string {
  try {
    // Build identity: the build timestamp matters more than the version here
    // (package.json sits at 0.0.0) — stale-PWA reports are the bug class to
    // pin down, and the timestamp tells a stale install at a glance.
    const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown';
    const buildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'unknown';
    const timezone = (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
      } catch {
        return 'unknown';
      }
    })();

    return [
      '--- Auto-filled device details (please keep) ---',
      `App: Weather Whisperer ${appVersion} (built ${buildTime})`,
      `Language: ${language}`,
      `Online: ${navigator.onLine ? 'yes' : 'no'}`,
      `Display: ${isStandalone() ? 'installed app' : 'browser tab'}`,
      `Viewport: ${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}x`,
      `Platform: ${navigator.userAgent}`,
      `Timezone: ${timezone}`,
      `Page: ${window.location.href}`,
      `Sent: ${new Date().toISOString()}`,
    ].join('\n');
  } catch {
    return '--- Device details unavailable (collection failed) ---';
  }
}
