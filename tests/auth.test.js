import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import { createAuthService } from '../src/services/auth.js';
import { createMemoryRepo } from './helpers/memory-repo.js';

const START = new Date('2030-06-01T08:00:00Z');

function setup() {
  const repo = createMemoryRepo();
  const clock = { now: START };
  const auth = createAuthService({ repo, now: () => clock.now, sessionSecret: 'test-secret' });
  return { repo, auth, clock };
}

describe('authentication', () => {
  it('AC-1: stores only a bcrypt hash of the password, normalises the email, and rejects short passwords', async () => {
    const { repo, auth } = setup();
    await auth.register({ email: ' Ana@Uni.bg ', password: 'correct horse' });
    const stored = repo.users[0].password_hash;
    expect(stored).not.toBe('correct horse');
    expect(await bcrypt.compare('correct horse', stored)).toBe(true);
    expect(repo.users[0].email).toBe('ana@uni.bg');
    await expect(auth.register({ email: 'b@uni.bg', password: 'short' })).rejects.toMatchObject({ status: 400 });
  });

  it('AC-2: a second account with the same email is refused', async () => {
    const { auth } = setup();
    await auth.register({ email: 'ana@uni.bg', password: 'long-password' });
    await expect(auth.register({ email: 'ANA@uni.bg', password: 'another-pass' })).rejects.toMatchObject({ status: 409 });
  });

  it('AC-3: a wrong password and an unknown email get the same generic message', async () => {
    const { auth } = setup();
    await auth.register({ email: 'ana@uni.bg', password: 'long-password' });
    const wrong = await auth.login({ email: 'ana@uni.bg', password: 'nope-nope' }).catch((e) => e);
    const unknown = await auth.login({ email: 'who@uni.bg', password: 'nope-nope' }).catch((e) => e);
    expect(wrong).toMatchObject({ status: 401, message: 'Invalid email or password.' });
    expect(unknown).toMatchObject({ status: 401, message: 'Invalid email or password.' });
  });

  it('AC-4: a verified Google email links to the existing local account', async () => {
    const { repo, auth } = setup();
    const local = await auth.register({ email: 'ana@uni.bg', password: 'long-password' });
    const google = await auth.signInWithGoogle({ sub: 'g-1', email: 'ana@uni.bg', email_verified: true });
    expect(google.user.id).toBe(local.user.id);
    expect(repo.users).toHaveLength(1);
    expect(repo.identities).toEqual([{ user_id: local.user.id, provider: 'google', provider_user_id: 'g-1' }]);
  });

  it('AC-5: an unverified Google email never links to an existing account', async () => {
    const { repo, auth } = setup();
    await auth.register({ email: 'ana@uni.bg', password: 'long-password' });
    await expect(
      auth.signInWithGoogle({ sub: 'g-9', email: 'ana@uni.bg', email_verified: false }),
    ).rejects.toMatchObject({ status: 403 });
    expect(repo.identities).toHaveLength(0);
  });

  it('AC-6: one Google account always maps to the same user, and it shares the session model with password login', async () => {
    const { repo, auth } = setup();
    const first = await auth.signInWithGoogle({ sub: 'g-2', email: 'ben@uni.bg', email_verified: true, name: 'Ben' });
    const second = await auth.signInWithGoogle({ sub: 'g-2', email: 'ben@uni.bg', email_verified: true });
    expect(second.user.id).toBe(first.user.id);
    expect(repo.users).toHaveLength(1);
    expect(await auth.userForToken(first.token)).toMatchObject({ id: first.user.id, email: 'ben@uni.bg' });
    const password = await auth.register({ email: 'cy@uni.bg', password: 'long-password' });
    expect(await auth.userForToken(password.token)).toMatchObject({ email: 'cy@uni.bg' });
  });

  it('AC-7: a session token stops working after its lifetime', async () => {
    const { auth, clock } = setup();
    const { token } = await auth.register({ email: 'ana@uni.bg', password: 'long-password' });
    expect(await auth.userForToken(token)).not.toBeNull();
    clock.now = new Date(START.getTime() + 15 * 24 * 60 * 60 * 1000);
    expect(await auth.userForToken(token)).toBeNull();
  });

  it('AC-8: logout invalidates the session token', async () => {
    const { auth } = setup();
    const { token } = await auth.register({ email: 'ana@uni.bg', password: 'long-password' });
    await auth.logout(token);
    expect(await auth.userForToken(token)).toBeNull();
    await auth.logout(undefined);
    expect(await auth.userForToken(undefined)).toBeNull();
  });
});
