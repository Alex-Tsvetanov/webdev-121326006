import { describe, it, expect, vi } from 'vitest';
import { createGeminiClient } from '../src/ai/gemini.js';
import { createAiService } from '../src/services/ai.js';
import { AiError } from '../src/errors.js';
import { createMemoryRepo } from './helpers/memory-repo.js';

const KEY = 'AIza-test-key-that-must-never-be-logged';
const reply = (status, body) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('Gemini adapter failures', () => {
  it('AC-36: a refused request logs the provider reason without the key, and the user sees a specific sentence', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const refused = createGeminiClient({
      apiKey: KEY,
      model: 'gemini-2.5-flash',
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
