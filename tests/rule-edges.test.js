// Edge cases of the rules in src/services, so every branch of the service layer is decided by a test.
import { describe, it, expect } from 'vitest';
import { createAuthService, hashToken } from '../src/services/auth.js';
import { createReservationService } from '../src/services/reservations.js';
import { createAiService } from '../src/services/ai.js';
import { createGoogleClient } from '../src/auth/google.js';
import { createServices } from '../src/container.js';
import { createMemoryRepo } from './helpers/memory-repo.js';

describe('rule edge cases', () => {
  it('AC-1: a missing email or a non-text password is refused, and the auth service will not start without SESSION_SECRET', async () => {
    const repo = createMemoryRepo();
    const auth = createAuthService({ repo, sessionSecret: 'secret' });
    await expect(auth.register({ password: 'long-password' })).rejects.toMatchObject({ status: 400 });
    await expect(auth.register({ email: 'a@uni.bg', password: 12345678 })).rejects.toMatchObject({ status: 400 });
    expect(() => createAuthService({ repo })).toThrow(/SESSION_SECRET/);
  });

  it('AC-3: a Google-only account cannot log in with a password, and a missing password is refused', async () => {
    const repo = createMemoryRepo();
    const auth = createAuthService({ repo, sessionSecret: 'secret' });
    await auth.signInWithGoogle({ sub: 'g-7', email: 'gg@uni.bg', email_verified: true });
    await expect(auth.login({ email: 'gg@uni.bg', password: 'anything-long' })).rejects.toMatchObject({ status: 401 });
    await auth.register({ email: 'ana@uni.bg', password: 'long-password' });
    await expect(auth.login({ email: 'ana@uni.bg' })).rejects.toMatchObject({ status: 401 });
  });

  it('AC-6: a Google sign-in with no profile is refused, and a session whose user no longer exists is rejected', async () => {
    const repo = createMemoryRepo();
    const auth = createAuthService({ repo, sessionSecret: 'secret' });
    await expect(auth.signInWithGoogle(undefined)).rejects.toMatchObject({ status: 400 });
    await repo.insertSession({ tokenHash: hashToken('secret', 'orphan'), userId: 999, expiresAt: new Date('2099-01-01') });
    expect(await auth.userForToken('orphan')).toBeNull();
  });

  it('AC-9: the reservation service works with the real clock when none is injected', async () => {
    const svc = createReservationService({ repo: createMemoryRepo() });
    const booked = await svc.create({ id: 1 }, { labId: 1, startsAt: '2099-01-01T10:00:00Z', endsAt: '2099-01-01T11:00:00Z' });
    expect(booked.lab_id).toBe(1);
  });

  it('AC-12: changing only the end time, or only the start time, keeps the other one', async () => {
    const svc = createReservationService({ repo: createMemoryRepo(), now: () => new Date('2030-06-01T08:00:00Z') });
    const ana = { id: 1 };
    const r = await svc.create(ana, { labId: 1, startsAt: '2030-06-03T10:00:00Z', endsAt: '2030-06-03T12:00:00Z' });
    const shorter = await svc.update(ana, r.id, { endsAt: '2030-06-03T11:00:00Z' });
    expect(shorter.starts_at.getTime()).toBe(new Date('2030-06-03T10:00:00Z').getTime());
    expect(shorter.ends_at.getTime()).toBe(new Date('2030-06-03T11:00:00Z').getTime());
    const later = await svc.update(ana, r.id, { startsAt: '2030-06-03T10:30:00Z' });
    expect(later.starts_at.getTime()).toBe(new Date('2030-06-03T10:30:00Z').getTime());
    expect(later.ends_at.getTime()).toBe(new Date('2030-06-03T11:00:00Z').getTime());
  });

  it('AC-15: a lab with no equipment is shown to the model as "none", and the real clock is used when none is injected', async () => {
    const repo = { ...createMemoryRepo(), listLabs: async () => [{ id: 1, name: 'Bare', location: 'B1', capacity: 2, equipment: [] }] };
    let prompt = '';
    const client = {
      generateJson: async (p) => {
        prompt = p;
        return { labId: 1, startsAt: '2099-01-01T10:00:00Z', endsAt: '2099-01-01T11:00:00Z', purpose: 'quiet work' };
      },
    };
    const res = await createAiService({ client, repo }).suggestReservation('quiet room');
    expect(prompt).toMatch(/equipment: none/);
    expect(res.status).toBe('ok');
  });

  it('AC-19: a missing request is refused before any model call', async () => {
    const ai = createAiService({ client: null, repo: createMemoryRepo() });
    await expect(ai.suggestReservation(undefined)).rejects.toMatchObject({ status: 400 });
  });

  it('AC-27: a failed userinfo call gives the readable Google error', async () => {
    const replies = [Response.json({ access_token: 't' }), new Response('no', { status: 401 })];
    const google = createGoogleClient({
      clientId: 'c',
      clientSecret: 's',
      redirectUri: 'http://localhost:3000/auth/google/callback',
      fetchImpl: async () => replies.shift(),
    });
    await expect(google.fetchProfile('code')).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/Google sign-in failed/),
    });
  });

  it('AC-28: the container builds services from configuration, and refuses to start without SESSION_SECRET', () => {
    const base = {
      databaseUrl: 'postgres://u:p@localhost/db',
      pgSsl: false,
      sessionDays: 14,
      publicBaseUrl: 'http://localhost:3000',
      aiTimeoutMs: 1000,
      modelName: 'gemini-2.5-flash',
    };
    const plain = createServices({ ...base, sessionSecret: 'secret' });
    expect(plain.google).toBeNull();
    expect(plain.ai).toBeTruthy();
    const withGoogle = createServices({
      ...base,
      sessionSecret: 'secret',
      googleClientId: 'id',
      googleClientSecret: 'sec',
      geminiApiKey: 'key',
    });
    expect(withGoogle.google.authUrl('st')).toMatch(/state=st/);
    expect(() => createServices({ ...base, sessionSecret: '' })).toThrow(/SESSION_SECRET/);
  });
});
