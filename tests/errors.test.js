import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/http/app.js';
import { createAuthService } from '../src/services/auth.js';
import { createMemoryRepo } from './helpers/memory-repo.js';

const NOW = new Date('2030-06-01T08:00:00Z');
const staticDir = fileURLToPath(new URL('../public', import.meta.url));
const config = { publicBaseUrl: 'http://localhost:3000', sessionDays: 14 };

describe('errors reach the user as sentences', () => {
  it('AC-31: an unknown page is a one-line 404, malformed JSON is a 400 sentence, and an unexpected failure is a 500 without a stack trace', async () => {
    const repo = createMemoryRepo();
    const auth = createAuthService({ repo, now: () => NOW, sessionSecret: 'test-secret' });
    const reservations = {
      listLabs: async () => {
        throw new TypeError('Cannot read properties of undefined (reading "rows") at pg-repo.js:31');
      },
    };
    const app = createApp({ auth, reservations, ai: null, google: null, health: null, config, staticDir });

    const page = await request(app).get('/no-such-page');
    expect(page.status).toBe(404);
    expect(page.text).toBe('Not found.');

    await request(app).post('/api/auth/register').send({ email: 'dee@uni.bg', password: 'long-password' }).expect(201);
    const broken = await request(app).post('/api/auth/login').set('content-type', 'application/json').send('{oops');
    expect(broken.status).toBe(400);
    expect(broken.body.error).toMatch(/could not be read/);

    const token = (await request(app).post('/api/auth/token').send({ email: 'dee@uni.bg', password: 'long-password' })).body.token;
    const failed = await request(app).get('/api/labs').set('Authorization', `Bearer ${token}`);
    expect(failed.status).toBe(500);
    expect(failed.body).toEqual({ error: 'Something went wrong on our side. Please try again.' });
    expect(JSON.stringify(failed.body)).not.toMatch(/pg-repo|TypeError|at /);
  });
});
