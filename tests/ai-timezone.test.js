import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/http/app.js';
import { createAiService } from '../src/services/ai.js';
import { createAuthService } from '../src/services/auth.js';
import { createReservationService } from '../src/services/reservations.js';
import { createTools } from '../src/mcp/tools.js';
import { createMemoryRepo } from './helpers/memory-repo.js';

const USER = { id: 1 };
// A Saturday morning in Sofia: 08:00 UTC is 11:00 local (summer time, UTC+3).
const NOW = () => new Date('2030-06-01T08:00:00Z');

// The model answers with the clock it was shown; the test keeps the prompt to check what it was shown.
function answering(startsAt, endsAt) {
  const client = {
    prompt: '',
    async generateJson(p) {
      client.prompt = p;
      return { labId: 2, startsAt, endsAt, purpose: 'Solder a board' };
    },
  };
  return client;
}

// Seen on the live site on 2026-11-19: "10:00 to 12:00" from a browser in Bulgaria came back as 12:00 to 14:00,
// because the model was shown UTC and answered in UTC.
describe('assistant suggestions in the user\'s time zone', () => {
  // New York, not Sofia: JavaScript reads a time without an offset in the machine's own zone, so a Sofia test
  // would pass by accident on a machine in Sofia, and a UTC test by accident on CI.
  it('AC-43: "10:00 to 12:00" from a browser in America/New_York is 14:00 to 16:00 UTC in summer and 15:00 to 17:00 UTC in winter', async () => {
    const summer = answering('2030-06-03T10:00', '2030-06-03T12:00');
    const s = await createAiService({ client: summer, repo: createMemoryRepo(), now: NOW })
      .suggestReservation(USER, 'Electronics lab Monday 10 to 12', { timeZone: 'America/New_York' });
    expect(s).toMatchObject({ status: 'ok', suggestion: { startsAt: '2030-06-03T14:00:00.000Z', endsAt: '2030-06-03T16:00:00.000Z' } });

    const winter = answering('2030-12-03T10:00', '2030-12-03T12:00');
    const w = await createAiService({ client: winter, repo: createMemoryRepo(), now: NOW })
      .suggestReservation(USER, 'Electronics lab 3 December 10 to 12', { timeZone: 'America/New_York' });
    expect(w.suggestion).toMatchObject({ startsAt: '2030-12-03T15:00:00.000Z', endsAt: '2030-12-03T17:00:00.000Z' });
  });

  it('AC-43: the model is shown the local date, time and weekday, and never the zone\'s name', async () => {
    const client = answering('2030-06-03T10:00', '2030-06-03T12:00');
    await createAiService({ client, repo: createMemoryRepo(), now: NOW })
      .suggestReservation(USER, 'lab on Monday', { timeZone: 'Europe/Sofia' });
    expect(client.prompt).toContain('Current local date and time: 2030-06-01T11:00 (Saturday)');
    expect(client.prompt).not.toContain('Europe/Sofia');
    expect(client.prompt).not.toMatch(/UTC/);
  });

  it('AC-43: an answer that adds an offset is still read on the clock the model was shown', async () => {
    const client = answering('2030-06-03T10:00:00Z', '2030-06-03T12:00:00+00:00');
    const res = await createAiService({ client, repo: createMemoryRepo(), now: NOW })
      .suggestReservation(USER, 'lab', { timeZone: 'Europe/Sofia' });
    expect(res.suggestion).toMatchObject({ startsAt: '2030-06-03T07:00:00.000Z', endsAt: '2030-06-03T09:00:00.000Z' });
  });

  it('AC-43: no zone, or one that is not a real zone, means UTC', async () => {
    for (const timeZone of [undefined, 'Mars/Olympus', 42, 'x'.repeat(100)]) {
      const client = answering('2030-06-03T10:00', '2030-06-03T12:00');
      const res = await createAiService({ client, repo: createMemoryRepo(), now: NOW }).suggestReservation(USER, 'lab', { timeZone });
      expect([timeZone, res.suggestion.startsAt]).toEqual([timeZone, '2030-06-03T10:00:00.000Z']);
      expect(client.prompt).toContain('Current local date and time: 2030-06-01T08:00 (Saturday)');
    }
  });

  it('AC-43: the web route and the MCP tool both pass the zone on', async () => {
    const repo = createMemoryRepo();
    const ai = createAiService({ client: answering('2030-06-03T10:00', '2030-06-03T12:00'), repo, now: NOW });
    const auth = createAuthService({ repo, now: NOW, sessionSecret: 'test-secret' });
    const app = createApp({
      auth,
      reservations: createReservationService({ repo, now: NOW }),
      ai,
      google: null,
      config: { publicBaseUrl: 'http://localhost:3000', sessionDays: 14 },
      staticDir: fileURLToPath(new URL('../public', import.meta.url)),
    });
    const { token } = await auth.register({ email: 'ana@uni.bg', password: 'long-password' });
    const web = await request(app).post('/api/ai/suggest-reservation').set('Authorization', `Bearer ${token}`)
      .send({ text: 'lab', timeZone: 'America/New_York' });
    expect(web.body.suggestion.startsAt).toBe('2030-06-03T14:00:00.000Z');

    const tool = createTools({ ai }).find((t) => t.name === 'suggest_reservation');
    expect(tool.schema.safeParse({ text: 'lab', timeZone: 'America/New_York' }).success).toBe(true);
    expect((await tool.run({ id: 1 }, { text: 'lab', timeZone: 'America/New_York' })).suggestion.startsAt).toBe('2030-06-03T14:00:00.000Z');
  });

  it('AC-43: the page sends the browser\'s time zone with the request', async () => {
    const { readFileSync } = await import('node:fs');
    const js = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
    expect(js).toMatch(/timeZone: Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
  });
});
