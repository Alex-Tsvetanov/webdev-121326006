import { describe, it, expect, vi } from 'vitest';
import { createGeminiClient } from '../src/ai/gemini.js';
import { createAiService } from '../src/services/ai.js';
import { AiError } from '../src/errors.js';
import { createMemoryRepo } from './helpers/memory-repo.js';

const KEY = 'fake-key-for-tests-that-must-never-be-logged';
const reply = (status, body) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('Gemini adapter failures', () => {
  it('AC-36: a refused request logs the provider reason without the key, and the user sees a specific sentence', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const refused = createGeminiClient({
      apiKey: KEY,
      model: 'gemini-3.6-flash',
      fetchImpl: reply(403, { error: { message: 'API key not valid. Please pass a valid API key.' } }),
    });

    const error = await refused.generateJson('prompt', { timeoutMs: 1000 }).catch((e) => e);
    expect(error).toBeInstanceOf(AiError);
    expect(error.code).toBe('provider_error');
    const logged = log.mock.calls.flat().join(' ');
    expect(logged).toMatch(/HTTP 403: API key not valid/);
    expect(logged).not.toContain(KEY);

    const ai = createAiService({
      client: { generateJson: async () => Promise.reject(error) },
      repo: createMemoryRepo(),
    });
    const res = await ai.suggestReservation({ id: 1 }, 'lab please');
    expect(res.status).toBe('unavailable');
    expect(res.message).toMatch(/refused the request/);
    log.mockRestore();
  });

  // `minimal` is the Gemini 3 name for the lowest thinking level; `thinkingBudget: 0` is the Gemini 2.5 one.
  // Measured on 2026-11-19 against gemini-3.6-flash: both gave 0 thinking tokens and an answer in 1 to 2 s,
  // while no thinking setting at all was still running after 60 s. So this pins the documented name.
  it('AC-36: the request asks for the minimal thinking level, so a one-object answer comes back within the timeout', async () => {
    let sent;
    const client = createGeminiClient({
      apiKey: KEY,
      model: 'gemini-3.6-flash',
      fetchImpl: async (url, init) => {
        sent = JSON.parse(init.body);
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"labId":1}' }] } }] }), { status: 200 });
      },
    });
    await expect(client.generateJson('p', { timeoutMs: 1000 })).resolves.toEqual({ labId: 1 });
    expect(sent.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'minimal' });
  });

  it('AC-36: a 503 from the provider means busy, not refused, and says to try again', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const busy = createGeminiClient({
      apiKey: KEY,
      model: 'gemini-3.8-flash',
      fetchImpl: reply(503, { error: { message: 'This model is currently experiencing high demand.' } }),
    });
    await expect(busy.generateJson('p', { timeoutMs: 1000 })).rejects.toMatchObject({ code: 'rate_limited' });
    expect(log.mock.calls.flat().join(' ')).toMatch(/Gemini is busy: HTTP 503/);
    log.mockRestore();
  });

  it('AC-36: an answer with no text, or text that is not JSON, gets its own sentence and a log line without the text', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const noText = createGeminiClient({ apiKey: KEY, model: 'm', fetchImpl: reply(200, { candidates: [{ finishReason: 'SAFETY' }] }) });
    await expect(noText.generateJson('p', { timeoutMs: 1000 })).rejects.toMatchObject({ code: 'empty' });
    expect(log.mock.calls.flat().join(' ')).toMatch(/finishReason=SAFETY/);

    const notJson = createGeminiClient({
      apiKey: KEY,
      model: 'm',
      fetchImpl: reply(200, { candidates: [{ content: { parts: [{ text: 'Sure! Here is the lab: Biology' }] } }] }),
    });
    await expect(notJson.generateJson('p', { timeoutMs: 1000 })).rejects.toMatchObject({ code: 'invalid_json' });
    expect(log.mock.calls.flat().join(' ')).not.toContain('Biology');
    log.mockRestore();
  });
});

// Measured on 2026-11-19 with the real key: gemini-3.6-flash answered 503 "high demand" or hung past 60 s
// in five tries out of five, while gemini-3.1-flash-lite answered in 1 to 2 s every time.
describe('Gemini fallback model', () => {
  const FALLBACK = 'gemini-3.1-flash-lite';
  const ok = (obj) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });
  const modelOf = (url) => String(url).match(/models\/([^:]+):/)[1];
  const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {});

  it('AC-42: a busy main model (503 or 429) hands the same request to the fallback model, and its answer is used', async () => {
    const log = quiet();
    for (const busy of [503, 429]) {
      const calls = [];
      const client = createGeminiClient({
        apiKey: KEY,
        model: 'gemini-3.6-flash',
        fetchImpl: async (url, init) => {
          calls.push({ model: modelOf(url), body: init.body });
          return calls.length === 1 ? new Response('{}', { status: busy }) : ok({ labId: 2 });
        },
      });
      await expect(client.generateJson('p', { timeoutMs: 1000 })).resolves.toEqual({ labId: 2 });
      expect(calls.map((c) => c.model)).toEqual(['gemini-3.6-flash', FALLBACK]);
      expect(calls[1].body).toBe(calls[0].body);
    }
    expect(log.mock.calls.flat().join(' ')).toMatch(/trying gemini-3\.1-flash-lite/);
    log.mockRestore();
  });

  it('AC-42: a main model that has not answered in half the timeout leaves the other half to the fallback model', async () => {
    const log = quiet();
    const started = Date.now();
    let mainGaveUpAfter;
    const client = createGeminiClient({
      apiKey: KEY,
      model: 'gemini-3.6-flash',
      fetchImpl: (url, init) => {
        if (modelOf(url) !== 'gemini-3.6-flash') return Promise.resolve(ok({ labId: 3 }));
        return new Promise((resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            mainGaveUpAfter = Date.now() - started;
            reject(init.signal.reason);
          });
        });
      },
    });
    await expect(client.generateJson('p', { timeoutMs: 400 })).resolves.toEqual({ labId: 3 });
    expect(mainGaveUpAfter).toBeGreaterThanOrEqual(180);
    expect(mainGaveUpAfter).toBeLessThan(380);
    log.mockRestore();
  });

  it('AC-42: a refused request (400) is not sent again, and with MODEL_NAME already the fallback there is one try', async () => {
    const log = quiet();
    let calls = 0;
    const refused = createGeminiClient({ apiKey: KEY, model: 'gemini-3.6-flash', fetchImpl: async () => { calls += 1; return new Response('{}', { status: 400 }); } });
    await expect(refused.generateJson('p', { timeoutMs: 1000 })).rejects.toMatchObject({ code: 'provider_error' });
    expect(calls).toBe(1);

    calls = 0;
    const alone = createGeminiClient({ apiKey: KEY, model: FALLBACK, fetchImpl: async () => { calls += 1; return new Response('{}', { status: 503 }); } });
    await expect(alone.generateJson('p', { timeoutMs: 1000 })).rejects.toMatchObject({ code: 'rate_limited' });
    expect(calls).toBe(1);
    log.mockRestore();
  });
});
