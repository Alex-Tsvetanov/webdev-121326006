import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/http/app.js';
import { createHealthService } from '../src/services/health.js';
import { createMemoryRepo } from './helpers/memory-repo.js';

const staticDir = fileURLToPath(new URL('../public', import.meta.url));

function appWithDatabase(repo) {
  const health = createHealthService({ repo });
  return createApp({ health, config: { publicBaseUrl: 'http://localhost:3000', sessionDays: 14 }, staticDir });
}

describe('health', () => {
  it('AC-30: /health answers 200 while the database answers, and 503 with a sentence when it does not', async () => {
    const working = appWithDatabase(createMemoryRepo());
    const up = await request(working).get('/health');
    expect(up.status).toBe(200);
    expect(up.body).toEqual({ status: 'ok' });

    const broken = createMemoryRepo();
    broken.ping = async () => {
      throw new Error('connection refused by 10.0.0.5:5432');
    };
    const down = await request(appWithDatabase(broken)).get('/health');
    expect(down.status).toBe(503);
    expect(down.body.error).toMatch(/database is not answering/);
    expect(JSON.stringify(down.body)).not.toMatch(/10\.0\.0\.5|connection refused/);
  });

  it('AC-30: the health service reports ok only when the ping succeeds', async () => {
    expect(await createHealthService({ repo: createMemoryRepo() }).check()).toEqual({ ok: true });
    const broken = { ping: async () => Promise.reject(new Error('down')) };
    expect(await createHealthService({ repo: broken }).check()).toEqual({ ok: false });
  });
});
