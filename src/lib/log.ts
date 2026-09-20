// Thin logging utility for diagnostic timing and failure messages.
// All output is suppressed in production builds (`import.meta.env.PROD === true`)
// to keep the dev console useful without leaking diagnostic noise to end users.

const isProd = import.meta.env.PROD;

/** Stringify any error-like value into a single line suitable for inlining. */
function formatErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Log a successful operation's duration. No-op in production.
 */
export function logTiming(label: string, ms: number): void {
  if (isProd) return;
  console.log(`${label} took ${ms}ms`);
}

/**
 * Log a failed operation's duration and error. No-op in production.
 * Uses `console.error` so it surfaces red in dev. Error is inlined into the
 * message string (not passed as a second arg) so it stays a single entry.
 * Use for retryable network calls where the cause (timeout vs abort vs error) is useful.
 */
export function logFailure(label: string, ms: number, err: unknown): void {
  if (isProd) return;
  // Detect both fetch timeouts (AbortController fired by a timeout) and explicit
  // aborts. Not all runtimes wrap these as DOMException, so check by name only.
  const name = (err as { name?: unknown } | null)?.name;
  const cause =
    name === 'TimeoutError' || name === 'AbortError' ? 'timeout/abort' : 'error';
  console.error(`${label} ${cause} after ${ms}ms: ${formatErr(err)}`);
}

/**
 * Log a non-fatal warning. No-op in production. Error is inlined into the
 * message string so the entry stays a single line and the stack isn't lost
 * to a separate console object.
 */
export function logWarn(message: string, err?: unknown): void {
  if (isProd) return;
  console.warn(err ? `${message}: ${formatErr(err)}` : message);
}

/**
 * Log an error. No-op in production. Error is inlined into the message string.
 */
export function logError(message: string, err?: unknown): void {
  if (isProd) return;
  console.error(err ? `${message}: ${formatErr(err)}` : message);
}

/**
 * Log a structured event (name + flat properties). No-op in production —
 * prod reporting is the caller's job (e.g. Vercel Analytics `track`),
 * so this stays dev-console-only.
 */
export function logEvent(name: string, props?: Record<string, unknown>): void {
  if (isProd) return;
  console.log(`[event] ${name}${props ? ` ${JSON.stringify(props)}` : ''}`);
}