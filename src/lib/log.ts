// Thin logging utility for diagnostic timing and failure messages.
// All output is suppressed in production builds (`import.meta.env.PROD === true`)
// to keep the dev console useful without leaking diagnostic noise to end users.

const isProd = import.meta.env.PROD;

/**
 * Log a successful operation's duration. No-op in production.
 */
export function logTiming(label: string, ms: number): void {
  if (isProd) return;
  console.log(`${label} took ${ms}ms`);
}

/**
 * Log a failed operation's duration and error. No-op in production.
 * Use for retryable network calls where the cause (timeout vs error) is useful.
 */
export function logFailure(label: string, ms: number, err: unknown): void {
  if (isProd) return;
  const cause = err instanceof DOMException && err.name === 'TimeoutError' ? 'timeout' : 'error';
  console.log(`${label} ${cause} after ${ms}ms:`, err);
}

/**
 * Log a non-fatal warning. No-op in production.
 */
export function logWarn(message: string, err?: unknown): void {
  if (isProd) return;
  console.warn(message, err);
}

/**
 * Log an error. No-op in production.
 */
export function logError(message: string, err?: unknown): void {
  if (isProd) return;
  console.error(message, err);
}