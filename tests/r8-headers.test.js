import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/http/app.js';

describe('review finding R8: browser protections on every response', () => {
  it('AC-31 R8: pages refuse to be framed and are not sniffed, send no referrer to other sites, and do not name the framework', async () => {
    const app = createApp({
      auth: null,
      reservations: null,
      ai: null,
      google: null,
      health: null,
      config: { publicBaseUrl: 'http://localhost:3000', sessionDays: 14 },
      staticDir: fileURLToPath(new URL('../public', import.meta.url)),
    });

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('same-origin');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
