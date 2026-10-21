import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/http/app.js';
import { createAuthService } from '../src/services/auth.js';
import { createReservationService } from '../src/services/reservations.js';
import { createAiService } from '../src/services/ai.js';
import { createMemoryRepo } from './helpers/memory-repo.js';

const NOW = new Date('2030-06-01T08:00:00Z');
const config = { publicBaseUrl: 'http://localhost:3000', sessionDays: 14 };
const slot = { labId: 1, startsAt: '2030-06-03T10:00:00Z', endsAt: '2030-06-03T12:00:00Z', purpose: 'Lab work' };

function build({ google = null } = {}) {
  const repo = createMemoryRepo();
  const auth = createAuthService({ repo, now: () => NOW, sessionSecret: 'test-secret' });
  const reservations = createReservationService({ repo, now: () => NOW });
  const ai = createAiService({ client: null, repo, now: () => NOW });
  const app = createApp({
    auth,
    reservations,
    ai,
    google,
    config,
    staticDir: fileURLToPath(new URL('../public', import.meta.url)),
  });
  return { app, repo };
}

describe('HTTP API', () => {
  it('AC-20: API routes refuse requests without a session, and unknown API routes return JSON 404', async () => {
    const { app } = build();
    const res = await request(app).get('/api/labs');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/sign in/i);
    expect((await request(app).get('/api/nope')).status).toBe(404);
    expect((await request(app).delete('/api/reservations/1').set('Authorization', 'Bearer x')).status).toBe(401);
  });

  it('AC-21: a signed-in user books a lab, and a clash returns a readable 409', async () => {
    const { app } = build();
    const ana = request.agent(app);
    await ana.post('/api/auth/register').send({ email: 'ana@uni.bg', password: 'long-password' }).expect(201);
    const created = await ana.post('/api/reservations').send(slot);
    expect(created.status).toBe(201);

    const ben = request.agent(app);
    await ben.post('/api/auth/register').send({ email: 'ben@uni.bg', password: 'long-password' });
    const clash = await ben.post('/api/reservations').send(slot);
    expect(clash.status).toBe(409);
    expect(clash.body.error).toMatch(/already reserved/);

    const bad = await ben.post('/api/reservations').set('content-type', 'application/json').send('{oops');
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/valid JSON|could not be read/);
  });

  it('AC-22: a bearer token from /api/auth/token works for non-browser clients such as the MCP server', async () => {
    const { app } = build();
    await request(app).post('/api/auth/register').send({ email: 'cy@uni.bg', password: 'long-password' }).expect(201);
    const tokenRes = await request(app).post('/api/auth/token').send({ email: 'cy@uni.bg', password: 'long-password' });
    expect(tokenRes.status).toBe(200);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenRes.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('cy@uni.bg');
    await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${tokenRes.body.token}`).expect(204);
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenRes.body.token}`)).status).toBe(401);
  });

  it('AC-23: the Google callback rejects a missing or forged state, and Google routes return 503 when not configured', async () => {
    const google = {
      authUrl: (state) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
      fetchProfile: async () => ({ sub: 'g-1', email: 'g@uni.bg', email_verified: true }),
    };
    const { app } = build({ google });
    expect((await request(app).get('/auth/google/callback?code=abc&state=forged')).status).toBe(400);

    const start = await request(app).get('/auth/google');
    expect(start.status).toBe(302);
    const stateCookie = start.headers['set-cookie'][0].split(';')[0];
    const state = stateCookie.split('=')[1];
    const done = await request(app).get(`/auth/google/callback?code=abc&state=${state}`).set('Cookie', stateCookie);
    expect(done.status).toBe(302);
    expect(done.headers['set-cookie'].join(';')).toMatch(/sid=/);

    const { app: noGoogle } = build();
    expect((await request(noGoogle).get('/auth/google')).status).toBe(503);
    expect((await request(noGoogle).get('/auth/google/callback?state=x')).status).toBe(503);
  });
});
