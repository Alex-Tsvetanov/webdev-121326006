import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/http/app.js';
import { createAuthService } from '../src/services/auth.js';
import { createMemoryRepo } from './helpers/memory-repo.js';

describe('review finding R4: malformed cookies', () => {
  it('AC-20 R4: a session cookie with broken percent-encoding is treated as signed out, not as a server error', async () => {
    const auth = createAuthService({
      repo: createMemoryRepo(),
      now: () => new Date('2030-06-01T08:00:00Z'),
      sessionSecret: 'test-secret',
    });
    const app = createApp({
      auth,
      reservations: null,
      ai: null,
      google: null,
      health: null,
      config: { publicBaseUrl: 'http://localhost:3000', sessionDays: 14 },
      staticDir: fileURLToPath(new URL('../public', import.meta.url)),
    });

    const res = await request(app).get('/api/auth/me').set('Cookie', 'sid=%E0');

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/sign in/i);
  });
});
