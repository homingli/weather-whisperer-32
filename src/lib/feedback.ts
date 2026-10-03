/**
 * Feedback intake (HML-44).
 *
 * Submissions POST to the /api/feedback Vercel function (api/feedback.ts),
 * which files them as issues in the maintainer's Linear SUPPORT team —
 * no mail client involved, nothing public, no third-party email vendor.
 * The dialog's "copy details" action is the fallback for offline or
 * failed submissions.
 *
 * Channel history (plan doc on HML-44): a public GitHub tracker was
 * rejected (raw user feedback must not become the project's public face),
 * then a mailto: link (users had to send mail themselves).
 */
import { track } from '@vercel/analytics';
import { logEvent } from '@/lib/log';
import { collectFeedbackDiagnostics } from '@/lib/feedback-diagnostics';

export const FEEDBACK_ENDPOINT = '/api/feedback';

/** Kept in sync with MAX_MESSAGE_LENGTH in api/feedback.ts. */
export const FEEDBACK_MAX_MESSAGE_LENGTH = 5000;

export type FeedbackType = 'bug' | 'feature' | 'question';

export type FeedbackEventName = 'feedback.open' | 'feedback.send' | 'feedback.copy';

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

export interface SubmitFeedbackInput {
  type: FeedbackType;
  message: string;
  language: string;
}

/**
 * Submit feedback through the serverless function. Device diagnostics are
 * attached here so the dialog never has to build them eagerly. Throws on
 * any failure — the caller owns the error UX.
 */
export async function submitFeedback({ type, message, language }: SubmitFeedbackInput): Promise<void> {
  const response = await fetch(FEEDBACK_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type,
      message,
      language,
      diagnostics: collectFeedbackDiagnostics(language),
    }),
  });
  if (!response.ok) {
    throw new Error(`feedback submit failed with ${response.status}`);
  }
}
