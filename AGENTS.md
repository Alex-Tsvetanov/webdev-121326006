# Instructions for the agent

Read this file at the start of every session. Keep it short and correct; update it when the project changes.

## Project
<!-- One or two sentences: what the app does and for whom. Link SPEC.md. -->
See `SPEC.md` for goals, non-goals and acceptance criteria.

## Commands
<!-- How to install, run, test. Keep these exact and working. -->
- Install: `npm install` (or `npm ci` when `package-lock.json` is present)
- Run: `npm start` (needs `DATABASE_URL`, `SESSION_SECRET`; `npm run migrate` once against the database)
- Test: `npm test` (unit tests, then the Exercise 1 MCP check)
- Coverage: `npm run coverage` (service layer 100%, overall 80%)
- MCP server: `npm run mcp` (needs `MCP_TOKEN`, a session token from `POST /api/auth/token`)

## Conventions
- ESM modules (`"type": "module"`), two-space indent, single quotes.
- Business rules live in `src/services/`. Routes in `src/http/app.js` and tools in `src/mcp/tools.js` only read input, call a service, and shape the answer.
- SQL lives only in `src/db/pg-repo.js`. Migrations are `migrations/NNN_name.sql`, applied once in order.
- Errors: throw `AppError(status, sentence)` from `src/errors.js`. The HTTP layer returns `{ "error": sentence }`; MCP returns `isError: true` with the same sentence.
- Config: `src/config.js` reads the names in `.env.example`; `src/container.js` builds the services for both the web app and the MCP server.
- Tests: `tests/*.test.js`, one `AC-n:` title per criterion; `tests/helpers/memory-repo.js` is the in-memory repository the tests use.

## Layers
<!-- Fill in the file or folder for each layer. -->
Requests arrive two ways and both end in the same place:

- HTTP route handler → service → data access → database
- MCP tool → **the same service** → data access → database

A route handler reads the request and turns a result into a status code. A service holds the
rules and knows nothing about HTTP or about MCP. Only the data layer writes SQL. An MCP tool
that talks to the database directly is a second, unguarded way into your data: never add one.

## The model feature
<!-- Provider, env var, and the call site. -->
- The provider is named in exactly one file: `src/ai/gemini.js` (the model is `MODEL_NAME`, the key is `GEMINI_API_KEY`).
- The key comes from an environment variable and is never committed or logged.
- Every call has a timeout and a deterministic fallback, so the app still works when the provider is down or rate-limited.
- The model's output is re-checked against real data before anything is saved or shown.
- Tests never call the provider: they pass in a fake client.

## The MCP server
<!-- Where it lives and how it authenticates. -->
- Lives in `mcp-server/server.js`, grew out of Exercise 1. The protocol loop there is hand-written; do not replace it with an SDK.
- Tool metadata and argument checks are in `src/mcp/tools.js`; `TOOL_SPECS` must not build services, so the server can list tools without a database.
- Every tool calls a service function; none touches the data layer or the database directly.
- It carries a user, and enforces exactly the same authorization rules as the HTTP API.
- Adding a tool means adding a row to the table in `SPEC.md` too.

## Tests and coverage
- Every acceptance criterion in `SPEC.md` has an id like `AC-3`, and a test whose title contains that id.
- The coverage gate runs in CI: 100% of the service layer, 80% overall.
- A test is evidence. Changing a test so the code passes destroys the evidence.

## Always ask before
- deleting files or folders
- editing a migration that has already run
- installing or removing dependencies
- pushing, tagging or changing CI
- anything that touches secrets or `.env`
- changing an authentication or authorization rule
- adding, renaming or removing an MCP tool
- changing a coverage threshold
- sending user data to a third-party model

## Never
- commit secrets, passwords, API keys or an OAuth client secret
- weaken or delete a test to make it pass
- lower a coverage threshold or switch off a CI job to make the build green
- add an MCP tool that reaches past the service layer
- log a prompt that contains somebody's personal data
