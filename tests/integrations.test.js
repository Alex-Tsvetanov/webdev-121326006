import { describe, it, expect } from 'vitest';
import { createGoogleClient } from '../src/auth/google.js';
import { loadConfig } from '../src/config.js';

const REDIRECT = 'http://localhost:3000/auth/google/callback';

describe('integrations and configuration', () => {
  it('AC-27: the Google authorization URL carries state and the exact redirect URI, a code exchange returns the profile, and failures are readable', async () => {
    const failing = createGoogleClient({
      clientId: 'cid',
      clientSecret: 'sec',
      redirectUri: REDIRECT,
      fetchImpl: async () => new Response('nope', { status: 400 }),
    });
    const url = new URL(failing.authUrl('st-1'));
    expect(url.searchParams.get('state')).toBe('st-1');
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT);
    await expect(failing.fetchProfile('code')).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/Google sign-in failed/),
    });
    await expect(failing.fetchProfile('')).rejects.toMatchObject({ status: 400 });

    const replies = [Response.json({ access_token: 'tok' }), Response.json({ sub: 'g-1', email: 'a@uni.bg', email_verified: true })];
    const working = createGoogleClient({
      clientId: 'cid',
      clientSecret: 'sec',
      redirectUri: REDIRECT,
      fetchImpl: async () => replies.shift(),
    });
    expect(await working.fetchProfile('code')).toMatchObject({ sub: 'g-1', email_verified: true });
  });

  it('AC-28: configuration has safe defaults and reads port and SSL settings from the environment', () => {
    const defaults = loadConfig({});
    expect(defaults).toMatchObject({ port: 3000, pgSsl: false, aiTimeoutMs: 8000, modelName: 'gemini-2.5-flash' });
    expect(loadConfig({ PORT: '8080', PGSSL: 'true', AI_TIMEOUT_MS: '2000' })).toMatchObject({
      port: 8080,
      pgSsl: true,
      aiTimeoutMs: 2000,
    });
  });
});
