import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/http/app.js';
import { createAuthService } from '../src/services/auth.js';
import { createReservationService } from '../src/services/reservations.js';
import { createAiService } from '../src/services/ai.js';
import { createMemoryRepo } from './helpers/memory-repo.js';

const NOW = new Date('2030-06-01T08:00:00Z');
const SIGN_IN_FIRST = 'An account with this email already exists. Sign in with its password, then choose "Link Google account".';

function setup({ profile } = {}) {
  const repo = createMemoryRepo();
  const auth = createAuthService({ repo, now: () => NOW, sessionSecret: 'test-secret' });
  const google = {
    authUrl: (state) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
    fetchProfile: async () => profile,
  };
  const app = createApp({
    auth,
    reservations: createReservationService({ repo, now: () => NOW }),
    ai: createAiService({ client: null, repo, now: () => NOW }),
    google,
    config: { publicBaseUrl: 'http://localhost:3000', sessionDays: 14 },
    staticDir: fileURLToPath(new URL('../public', import.meta.url)),
  });
  return { repo, auth, app };
}

// A local account never proves it owns its email. Linking by email alone lets whoever registered
// the address first receive the real owner's Google sign-in.
describe('review finding R5: Google links to a password account only from inside that account', () => {
  it('AC-37 R5: a signed-out Google sign-in whose verified email belongs to a password account is refused, and nothing is linked', async () => {
    const { repo, auth } = setup();
    await auth.register({ email: 'victim@uni.bg', password: 'squatter-password' });

    await expect(
      auth.signInWithGoogle({ sub: 'g-victim', email: 'victim@uni.bg', email_verified: true }),
    ).rejects.toMatchObject({ status: 409, message: SIGN_IN_FIRST });
    expect(repo.identities).toHaveLength(0);
    expect(repo.sessions).toHaveLength(1); // only the session from registering
  });

  it('AC-37 R5: signed in to one account, a Google account with a different email is refused instead of linked or swapped', async () => {
    const { repo, auth } = setup();
    const ana = await auth.register({ email: 'ana@uni.bg', password: 'long-password' });

    await expect(
      auth.signInWithGoogle({ sub: 'g-ben', email: 'ben@uni.bg', email_verified: true }, { currentUser: ana.user }),
    ).rejects.toMatchObject({ status: 409 });
    expect(repo.identities).toHaveLength(0);
    expect(repo.users).toHaveLength(1);
  });

  it('AC-37 R5: the Google callback links only for the signed-in owner of the account', async () => {
    const { repo, app } = setup({ profile: { sub: 'g-1', email: 'ana@uni.bg', email_verified: true } });
    const registered = await request(app).post('/api/auth/register').send({ email: 'ana@uni.bg', password: 'long-password' });
    const sid = registered.headers['set-cookie'][0].split(';')[0];

    // Signed out: refused, nothing linked.
    const signedOut = await request(app).get('/auth/google/callback?code=c&state=s').set('Cookie', 'oauth_state=s');
    expect(signedOut.status).toBe(409);
    expect(signedOut.body.error).toBe(SIGN_IN_FIRST);
    expect(repo.identities).toHaveLength(0);

    // Signed in as the owner: linked to the same user, no new user.
    const linked = await request(app).get('/auth/google/callback?code=c&state=s').set('Cookie', `oauth_state=s; ${sid}`);
    expect(linked.status).toBe(302);
    expect(repo.identities).toEqual([{ user_id: repo.users[0].id, provider: 'google', provider_user_id: 'g-1' }]);
    expect(repo.users).toHaveLength(1);
  });

  it('AC-37 R5: the main screen offers "Link Google account" to a signed-in user', async () => {
    const { app } = setup();
    const page = await request(app).get('/index.html');
    expect(page.text).toMatch(/<a [^>]*id="link-google"[^>]*href="\/auth\/google"[^>]*>Link Google account<\/a>/);
  });
});
