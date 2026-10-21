// Names match .env.example, so one file documents every setting for the app and the MCP server.
export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT ?? 3000),
    publicBaseUrl: env.PUBLIC_BASE_URL ?? 'http://localhost:3000',
    databaseUrl: env.DATABASE_URL,
    pgSsl: env.PGSSL === 'true',
    sessionSecret: env.SESSION_SECRET ?? '',
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
    geminiApiKey: env.GEMINI_API_KEY,
    modelName: env.MODEL_NAME ?? 'gemini-2.5-flash',
    aiTimeoutMs: Number(env.AI_TIMEOUT_MS ?? 8000),
    sessionDays: 14,
  };
}

// The settings the app cannot run without. The web entry point refuses to start when one is missing.
export function missingSettings(config) {
  return [
    ['DATABASE_URL', config.databaseUrl],
    ['SESSION_SECRET', config.sessionSecret],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
}
