import { loadConfig } from './config.js';
import { createPool, createPgRepo } from './db/pg-repo.js';
import { createAuthService } from './services/auth.js';
import { createReservationService } from './services/reservations.js';
import { createAiService } from './services/ai.js';
import { createHealthService } from './services/health.js';
import { createGeminiClient } from './ai/gemini.js';
import { createGoogleClient } from './auth/google.js';

// Builds the same services for the web app and the MCP server, so both obey one set of rules.
export function createServices(config = loadConfig()) {
  const repo = createPgRepo(createPool(config.databaseUrl, { ssl: config.pgSsl }));
  return {
    repo,
    auth: createAuthService({ repo, sessionDays: config.sessionDays, sessionSecret: config.sessionSecret }),
    reservations: createReservationService({ repo }),
    health: createHealthService({ repo }),
    ai: createAiService({
      client: config.geminiApiKey ? createGeminiClient({ apiKey: config.geminiApiKey, model: config.modelName }) : null,
      repo,
      timeoutMs: config.aiTimeoutMs,
    }),
    google: config.googleClientId
      ? createGoogleClient({
          clientId: config.googleClientId,
          clientSecret: config.googleClientSecret,
          redirectUri: `${config.publicBaseUrl}/auth/google/callback`,
        })
      : null,
  };
}
