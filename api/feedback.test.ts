// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from './feedback';

const SUPPORT_TEAM_ID = '6bcd0f7f-8512-4408-8320-57a308f753ca';
const LINEAR_OK = {
  data: { issueCreate: { success: true, issue: { id: 'i1', identifier: 'SUP-1' } } },
};
const valid = { type: 'bug', message: 'Rain map is blank', language: 'en', diagnostics: 'App: test' };

function post(body: unknown): Promise<Response> {
  return handler(
    new Request('https://app.test/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

describe('api/feedback (HML-44)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('LINEAR_API_KEY', 'test-key');
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('rejects non-POST requests with an Allow header', async () => {
    const res = await handler(new Request('https://app.test/api/feedback', { method: 'GET' }));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  it('returns not_configured without LINEAR_API_KEY', async () => {
    vi.stubEnv('LINEAR_API_KEY', '');
    const res = await post(valid);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid json, unknown type, and out-of-bounds messages', async () => {
    expect((await post('not json')).status).toBe(400);
    expect((await post({ ...valid, type: 'spam' })).status).toBe(400);
    expect((await post({ ...valid, message: '   ' })).status).toBe(400);
    expect((await post({ ...valid, message: 'x'.repeat(5001) })).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('silently drops honeypot submissions without calling Linear', async () => {
    const res = await post({ ...valid, website: 'https://spam.example' });
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('files a Linear issue with the prefixed title and diagnostics attached', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(LINEAR_OK), { status: 200 }));
    const res = await post(valid);
    expect(res.status).toBe(200);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('test-key');

    const payload = JSON.parse(String(init.body));
    expect(payload.variables.input.teamId).toBe(SUPPORT_TEAM_ID);
    expect(payload.variables.input.title).toBe('[Bug] Rain map is blank');
    expect(payload.variables.input.description).toContain('Rain map is blank');
    expect(payload.variables.input.description).toContain('App: test');
  });

  it('maps Linear HTTP failures to an opaque 502', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));
    const res = await post(valid);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'linear_error' });
  });

  it('maps GraphQL-level errors to an opaque 502', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: 'validation' }] }), { status: 200 }),
    );
    const res = await post(valid);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'linear_error' });
  });
});
