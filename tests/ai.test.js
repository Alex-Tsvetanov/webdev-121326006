import { describe, it, expect } from 'vitest';
import { createAiService } from '../src/services/ai.js';
import { createGeminiClient } from '../src/ai/gemini.js';
import { AiError } from '../src/errors.js';
import { createMemoryRepo } from './helpers/memory-repo.js';

const USER = { id: 1 };

const NOW = () => new Date('2030-06-01T08:00:00Z');
const good = { labId: 1, startsAt: '2030-06-03T10:00:00Z', endsAt: '2030-06-03T12:00:00Z', purpose: 'Cell culture' };
const fakeClient = (outcome) => ({
  calls: 0,
  async generateJson() {
    this.calls += 1;
    if (outcome instanceof Error) throw outcome;
    return outcome;
  },
});
const geminiReply = (obj) => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });

describe('AI reservation suggestions', () => {
  it('AC-15: a valid model answer becomes a suggestion, and the Gemini client parses JSON replies', async () => {
    const ai = createAiService({ client: fakeClient(good), repo: createMemoryRepo(), now: NOW });
    const res = await ai.suggestReservation(USER, 'biology lab for two hours on Monday');
    expect(res.status).toBe('ok');
    expect(res.suggestion).toMatchObject({ labId: 1, labName: 'Biology Lab 1', purpose: 'Cell culture' });

    const gemini = createGeminiClient({ apiKey: 'k', model: 'm', fetchImpl: async () => geminiReply(good) });
    expect(await gemini.generateJson('prompt', { timeoutMs: 100 })).toEqual(good);
  });

  it('AC-16: unknown labs, reversed times, past times, and malformed answers are rejected before the user sees them', async () => {
    const cases = [
      { ...good, labId: 99 },
      { ...good, startsAt: good.endsAt, endsAt: good.startsAt },
      { ...good, startsAt: '2029-01-01T10:00:00Z', endsAt: '2029-01-01T12:00:00Z' },
      { ...good, startsAt: 'tomorrow-ish', endsAt: 'later' },
      { labId: 1, purpose: 'missing times' },
      'not an object',
    ];
    for (const output of cases) {
      const ai = createAiService({ client: fakeClient(output), repo: createMemoryRepo(), now: NOW });
      expect((await ai.suggestReservation(USER, 'anything')).status).toBe('invalid');
    }
  });

  it('AC-17: rate limits, timeouts, outages, and unexpected errors give a readable unavailable status, not a crash', async () => {
    const errors = [new AiError('rate_limited'), new AiError('timeout'), new AiError('provider_error'), new TypeError('boom')];
    for (const error of errors) {
      const ai = createAiService({ client: fakeClient(error), repo: createMemoryRepo(), now: NOW });
      const res = await ai.suggestReservation(USER, 'lab please');
      expect(res.status).toBe('unavailable');
      expect(res.message.length).toBeGreaterThan(10);
    }

    const run = (fetchImpl) => createGeminiClient({ apiKey: 'k', model: 'm', fetchImpl }).generateJson('p', { timeoutMs: 100 });
    await expect(run(async () => new Response('', { status: 429 }))).rejects.toMatchObject({ code: 'rate_limited' });
    await expect(run(async () => new Response('', { status: 503 }))).rejects.toMatchObject({ code: 'provider_error' });
    await expect(run(async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); })).rejects.toMatchObject({ code: 'timeout' });
    await expect(run(async () => { throw new Error('offline'); })).rejects.toMatchObject({ code: 'network' });
    await expect(run(async () => Response.json({ candidates: [] }))).rejects.toMatchObject({ code: 'empty' });
    await expect(run(async () => Response.json({ candidates: [{ content: { parts: [{ text: '{bad' }] } }] }))).rejects.toMatchObject({ code: 'invalid_json' });
  });

  it('AC-18: without an API key the assistant reports unavailable and never contacts the provider', async () => {
    let fetches = 0;
    const gemini = createGeminiClient({ apiKey: '', model: 'm', fetchImpl: async () => { fetches += 1; } });
    const ai = createAiService({ client: gemini, repo: createMemoryRepo(), now: NOW });
    expect((await ai.suggestReservation(USER, 'lab')).status).toBe('unavailable');
    expect(fetches).toBe(0);
    const noClient = createAiService({ client: null, repo: createMemoryRepo(), now: NOW });
    expect((await noClient.suggestReservation(USER, 'lab')).status).toBe('unavailable');
  });

  it('AC-19: an empty or overlong request is refused before any model call', async () => {
    const client = fakeClient(good);
    const ai = createAiService({ client, repo: createMemoryRepo(), now: NOW });
    await expect(ai.suggestReservation(USER, '   ')).rejects.toMatchObject({ status: 400 });
    await expect(ai.suggestReservation(USER, 'x'.repeat(501))).rejects.toMatchObject({ status: 400 });
    expect(client.calls).toBe(0);
  });
});
