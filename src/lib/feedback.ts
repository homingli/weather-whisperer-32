/**
 * Feedback intake (HML-44).
 *
 * User feedback lands in the maintainer's Linear SUPPORT team via its
 * intake email address: an email to that address becomes a triage issue,
 * no Linear account needed. Nothing the user submits reaches any public
 * surface — the maintainer curates what gets filed where.
 *
 * Channel choice (see the plan doc on HML-44): a public GitHub issue
 * tracker was rejected because raw user feedback becomes the project's
 * public face with no triage gate; a hosted form service was rejected as
 * an extra vendor for hobby-scale volume. mailto: needs no backend, works
 * offline, and every user already has an email app.
 */
import { track } from '@vercel/analytics';
import { logEvent } from '@/lib/log';
import { collectFeedbackDiagnostics } from '@/lib/feedback-diagnostics';

export const LINEAR_INTAKE_EMAIL = 'support-13d2337ddb2d@intake.linear.app';

export type FeedbackType = 'bug' | 'feature' | 'question';

/** Stable English prefixes — triage happens on the raw Linear issue title. */
const SUBJECT_PREFIX: Record<FeedbackType, string> = {
  bug: '[Bug]',
  feature: '[Feature]',
  question: '[Question]',
};

export interface FeedbackDraft {
  /** mailto: URL with subject + diagnostics body prefilled. */
  href: string;
  /** The same diagnostics text, for the clipboard fallback. */
  diagnostics: string;
}

export function buildFeedbackDraft(type: FeedbackType, language: string): FeedbackDraft {
  const diagnostics = collectFeedbackDiagnostics(language);
  const subject = `${SUBJECT_PREFIX[type]} Weather Whisperer`;
  // Leave the top of the body empty — that is where the user types. Encode
  // manually (not URLSearchParams) so spaces stay %20; some mail clients
  // render a literal '+' from query-encoded spaces. RFC 6068 requires CRLF
  // line breaks: bare LF collapses to one line in Outlook desktop.
  const body = `\n\n———\n${diagnostics}`.replace(/\n/g, '\r\n');
  return {
    href: `mailto:${LINEAR_INTAKE_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    diagnostics,
  };
}

export type FeedbackEventName = 'feedback.open' | 'feedback.email' | 'feedback.copy';

/**
 * Report a feedback interaction. Dev console only in dev; prod also emits
 * a Vercel Analytics custom event (same pattern as sw-observability.ts).
 */
export function reportFeedbackEvent(name: FeedbackEventName, type?: FeedbackType): void {
  try {
    logEvent(name, type ? { type } : undefined);
    if (import.meta.env.PROD) {
      track(name, type ? { type } : {});
    }
  } catch {
    // Observability must never take the app down.
  }
}
