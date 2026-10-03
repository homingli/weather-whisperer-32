/**
 * Vercel Serverless Function: in-app feedback submission (HML-44).
 *
 * POST /api/feedback   { type, message, diagnostics, website? }
 *
 * Files the message as an issue in the SUPPORT team via the Linear API —
 * the same destination as the team's intake email, with no mail client
 * involved. LINEAR_API_KEY (project env var) is the only secret and never
 * reaches the client.
 *
 * The endpoint is public, so abuse is bounded by:
 *   - a honeypot field (`website`) that silently 200s for bots,
 *   - hard length caps on every free-text field,
 *   - strict JSON field validation.
 * Vercel Firewall per-IP rate limiting can be layered on in the dashboard
 * without code changes.
 */

const LINEAR_GRAPHQL_ENDPOINT = 'https://api.linear.app/graphql';

/** SUPPORT team (Linear). Not a secret — it appears in issue URLs. */
const SUPPORT_TEAM_ID = '6bcd0f7f-8512-4408-8320-57a308f753ca';

/** Mirrors the client's feedback types; drives the triage title prefix. */
const SUBJECT_PREFIX: Record<string, string> = {
  bug: '[Bug]',
  feature: '[Feature]',
  question: '[Question]',
};

/** Must stay in sync with FEEDBACK_MAX_MESSAGE_LENGTH (src/lib/feedback.ts). */
export const MAX_MESSAGE_LENGTH = 5000;
const MAX_DIAGNOSTICS_LENGTH = 6000;
const MAX_TITLE_LENGTH = 120;

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function firstLine(text: string): string {
  return text.trim().split(/\r?\n/, 1)[0] ?? '';
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  }

  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    // Misconfiguration — stable code the client can surface in logs.
    return jsonResponse(500, { error: 'not_configured' });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse(400, { error: 'invalid_json' });
  }

  // Honeypot: real users never fill the hidden `website` field. Pretend
  // success so bots don't learn they were caught; drop the submission.
  if (typeof body.website === 'string' && body.website.length > 0) {
    return jsonResponse(200, { ok: true });
  }

  const type = typeof body.type === 'string' ? body.type : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const diagnostics = typeof body.diagnostics === 'string' ? body.diagnostics : '';
  if (!(type in SUBJECT_PREFIX) || message.length === 0 || message.length > MAX_MESSAGE_LENGTH) {
    return jsonResponse(400, { error: 'invalid_input' });
  }
  // `language` is intentionally not validated or used: it only existed in
  // early drafts of the payload, and the diagnostics block already carries
  // the user's language.

  const title =
    `${SUBJECT_PREFIX[type]} ${firstLine(message)}`.slice(0, MAX_TITLE_LENGTH).trim() ||
    SUBJECT_PREFIX[type];
  const description = [
    message,
    diagnostics ? `\n\n---\n${diagnostics.slice(0, MAX_DIAGNOSTICS_LENGTH)}` : '',
  ].join('');

  let linearResponse: Response;
  try {
    linearResponse = await fetch(LINEAR_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey,
      },
      body: JSON.stringify({
        query: `mutation IssueCreate($input: IssueCreateInput!) {
          issueCreate(input: $input) { success issue { id identifier } }
        }`,
        variables: {
          input: { teamId: SUPPORT_TEAM_ID, title, description },
        },
      }),
    });
  } catch {
    return jsonResponse(502, { error: 'linear_unreachable' });
  }

  if (!linearResponse.ok) {
    // Deliberately opaque: the upstream status is Linear's business.
    return jsonResponse(502, { error: 'linear_error' });
  }

  let payload: { data?: { issueCreate?: { success?: boolean } } };
  try {
    payload = (await linearResponse.json()) as typeof payload;
  } catch {
    return jsonResponse(502, { error: 'linear_error' });
  }
  if (!payload.data?.issueCreate?.success) {
    return jsonResponse(502, { error: 'linear_error' });
  }

  return jsonResponse(200, { ok: true });
}
