import { AiError } from '../errors.js';

// Thin adapter over Gemini's REST API. The key goes in a header, never in the URL.
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
        throw new AiError(err.name === 'TimeoutError' || err.name === 'AbortError' ? 'timeout' : 'network');
      }

      if (res.status === 429) throw new AiError('rate_limited');
      if (!res.ok) throw new AiError('provider_error');

      const data = await res.json().catch(() => null);
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== 'string') throw new AiError('empty');
      try {
        return JSON.parse(text);
      } catch {
        throw new AiError('invalid_json');
      }
    },
  };
}
