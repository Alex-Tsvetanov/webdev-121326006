import { AiError } from '../errors.js';

// When the main model is busy (429, 503), too slow, or unreachable, the same request goes once to this lighter model.
// Measured on 2026-11-19: gemini-3.6-flash answered 503 "high demand" or hung past 60 s in five tries out of five,
// while this model answered in 1 to 2 s every time.
export const FALLBACK_MODEL = 'gemini-3.1-flash-lite';
const WORTH_ANOTHER_MODEL = new Set(['rate_limited', 'timeout', 'network']);

// Thin adapter over Gemini's REST API. The key goes in a header, never in the URL.
// Failures are logged with the provider's own reason, so the server log says why. The key and the user's text are never logged.
export function createGeminiClient({ apiKey, model, fallbackModel = FALLBACK_MODEL, fetchImpl = fetch }) {
  return {
    async generateJson(prompt, { timeoutMs }) {
      if (!apiKey) throw new AiError('missing_key');
      if (fallbackModel === model) return ask(model, prompt, timeoutMs);

      // The main model gets half the time, so a request it never answers still leaves the fallback the other half.
      const started = Date.now();
      try {
        return await ask(model, prompt, Math.round(timeoutMs / 2));
      } catch (err) {
        if (!WORTH_ANOTHER_MODEL.has(err.code)) throw err;
        console.error(`Gemini ${model} failed (${err.code}); trying ${fallbackModel}`);
        return ask(fallbackModel, prompt, Math.max(1, timeoutMs - (Date.now() - started)));
      }
    },
  };

  async function ask(modelName, prompt, timeoutMs) {
    let res;
    try {
      res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          // As little thinking as the model allows: the answer is one small JSON object. Measured on 2026-11-19:
          // with no thinking setting gemini-3.6-flash was still thinking after 60 s; with `minimal` it answered in
          // about 1 s and used no thinking tokens. `minimal` is the Gemini 3 name for it (`thinkingBudget: 0` is the
          // Gemini 2.5 one). Both models used here accept it; a model that does not answers 400, and the log says so.
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2,
            thinkingConfig: { thinkingLevel: 'minimal' },
          },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const code = err.name === 'TimeoutError' || err.name === 'AbortError' ? 'timeout' : 'network';
      console.error(`Gemini request failed before an answer: ${err.name}: ${err.message}`);
      throw new AiError(code);
    }

    // 503 means "high demand, try later": the same user message as a 429, not a configuration problem.
    if (res.status === 429 || res.status === 503) {
      console.error(`Gemini is busy: HTTP ${res.status}`);
      throw new AiError('rate_limited');
    }
    if (!res.ok) {
      const detail = await res.json().then((body) => body?.error?.message).catch(() => null);
      console.error(`Gemini answered HTTP ${res.status}${detail ? `: ${String(detail).slice(0, 200)}` : ''}`);
      throw new AiError('provider_error');
    }

    const data = await res.json().catch(() => null);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') {
      console.error(`Gemini answer had no text: finishReason=${data?.candidates?.[0]?.finishReason ?? 'none'}, blockReason=${data?.promptFeedback?.blockReason ?? 'none'}`);
      throw new AiError('empty');
    }
    try {
      return JSON.parse(text);
    } catch {
      console.error(`Gemini answer was not JSON (${text.length} characters)`);
      throw new AiError('invalid_json');
    }
  }
}
