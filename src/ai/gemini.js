import { AiError } from '../errors.js';

// Thin adapter over Gemini's REST API. The key goes in a header, never in the URL.
// Failures are logged with the provider's own reason, so the server log says why. The key and the user's text are never logged.
export function createGeminiClient({ apiKey, model, fetchImpl = fetch }) {
  return {
    async generateJson(prompt, { timeoutMs }) {
      if (!apiKey) throw new AiError('missing_key');

      let res;
      try {
        res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
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
    },
  };
}
