// Calls the real model once, through the same adapter and service the app uses, and prints what happened.
// Run: npm run ai:probe   (GEMINI_API_KEY, MODEL_NAME and AI_TIMEOUT_MS come from the environment or .env)
// What is sent: the seed lab catalogue, the current time, and the fixed request below. No user data.
// What is printed: each model tried, its HTTP status, time and token counts, the total time, and the app's answer.
// The key is never printed.
import { loadConfig } from '../src/config.js';
import { createGeminiClient } from '../src/ai/gemini.js';
import { createAiService } from '../src/services/ai.js';

const REQUEST = 'Electronics lab tomorrow from 10:00 to 12:00 to solder a sensor board';
// The labs from migrations/002_seed_labs.sql.
const LABS = [
  { id: 1, name: 'Biology Lab 1', location: 'Building 2, floor 1', capacity: 20, equipment: ['Microscope'] },
  { id: 2, name: 'Electronics Lab', location: 'Building 3, floor 2', capacity: 12, equipment: ['Oscilloscope', 'Soldering station'] },
  { id: 3, name: 'Makerspace', location: 'Building 1, basement', capacity: 8, equipment: ['3D printer'] },
];

const config = loadConfig();
if (!config.geminiApiKey) {
  console.log('GEMINI_API_KEY is not set, so the app would answer "The AI assistant is not set up right now."');
  process.exit(1);
}

// Same fetch, but keeps each attempt's model, status, time and Google's usageMetadata (prompt, answer and
// thinking tokens). The adapter may try a second model when the first is busy or slow.
const attempts = [];
const fetchImpl = async (url, init) => {
  const attempt = { model: String(url).match(/models\/([^:]+):/)[1], httpStatus: null, ms: null, usage: null };
  attempts.push(attempt);
  const t0 = Date.now();
  try {
    const res = await fetch(url, init);
    attempt.httpStatus = res.status;
    attempt.usage = (await res.clone().json().catch(() => null))?.usageMetadata ?? null;
    return res;
  } finally {
    attempt.ms = Date.now() - t0;
  }
};

const client = createGeminiClient({ apiKey: config.geminiApiKey, model: config.modelName, fetchImpl });
const ai = createAiService({ client, repo: { listLabs: async () => LABS }, timeoutMs: config.aiTimeoutMs });

const started = Date.now();
const result = await ai.suggestReservation({ id: 0 }, REQUEST);
console.log(JSON.stringify({
  model: config.modelName,
  timeoutMs: config.aiTimeoutMs,
  elapsedMs: Date.now() - started,
  attempts,
  result,
}, null, 2));
process.exit(result.status === 'ok' ? 0 : 1);
