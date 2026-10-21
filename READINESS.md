# Readiness

This report says what is verified, what is not, and how I checked each claim. Anything
without a "How I checked" note is not claimed.

## Live URL

Not deployed yet. `course.json` has an empty `liveUrl`, and no Render service or Neon
database exists. Nothing on this page has been verified on a public HTTPS address.

- How I checked: the app ran on `http://localhost:3100` against a local Postgres 16, not on the internet.
- To verify once deployed: `node checks/ex4.mjs https://<your-app>`, then fill in `liveUrl`.

## Environment variables

Every variable the code reads is listed in `.env.example`.

| Variable | Required | Without it |
|---|---|---|
| `DATABASE_URL` | yes | the app refuses to start |
| `SESSION_SECRET` | yes | the app refuses to start |
| `PGSSL` | no (`true` on Neon) | no TLS to the database |
| `PUBLIC_BASE_URL` | no | defaults to `http://localhost:3000`; Google callback and cookie `secure` depend on it |
| `PORT` | no | 3000 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | no | Google sign-in answers 503 |
| `GEMINI_API_KEY` | no | the AI box says the assistant is not set up; no request leaves the server |
| `MODEL_NAME` | no | `gemini-2.5-flash` |
| `AI_TIMEOUT_MS` | no | 8000 |
| `MCP_TOKEN` | MCP server only | the MCP server refuses to act |

- How I checked: `AC-29` (`tests/config.test.js`). By hand: `env -i node src/main.js` exits with status 1 and prints `Cannot start: set DATABASE_URL and SESSION_SECRET in the environment. See .env.example.`
- No secrets are in the repository. The working tree and the full git history were searched for Google, Gemini and Postgres credential patterns, and no `.env` file was ever committed. The search covers known formats only.

## Failure behavior

- **Database down.** Checked by hand against a local Postgres 16: `/health` returned 200, then 503 with `{"status":"unavailable"}` while the process kept running, then 200 after Postgres restarted. Before the fix in `createPool` (AC-32), stopping Postgres killed the process.
- **API while the database is down.** Returns 500 with one sentence and no stack trace (`AC-31`, `tests/errors.test.js`).
- **Malformed JSON.** Returns 400 with a sentence. Checked by hand with `curl`.
- **Unknown page.** Returns a one-line 404. Checked by hand with `curl`. Unknown `/api/` paths return JSON 404.
- **Model provider down, slow, or rate-limited.** The box shows a sentence and the booking form still works (`AC-17`, a fake client in `tests/ai.test.js`). Not tested against the live provider.

## The four states of one screen

Not checked. The code has loading, empty and error text for the labs list and the reservation list, but I have not looked at them in a browser. See `docs/UI.md`.

## Request waterfall

Not measured. There is no browser run and no deployed site to measure against.

## Security basics

- Passwords are stored as bcrypt hashes (`AC-1`). Sessions are stored as hashes, so a leaked table cannot be used as cookies (`SESSION_SECRET` keys the hash).
- Cookies are `httpOnly` and `sameSite: lax`, and `secure` when `PUBLIC_BASE_URL` is https (`src/http/app.js`).
- A user cannot change another user's reservation: the rule is in the service and returns 403 (`AC-11`).
- The Docker image runs as the `node` user, not root, and `.dockerignore` keeps `.env` out of the image. Not built, see the gaps.
- Not done: no rate limit on `/api/auth/login` or `/api/auth/register`, so password guessing is not throttled. No CSRF token; `sameSite: lax` and JSON-only writes are the only protection. Not checked: the response headers of the deployed site.

## Known gaps, ranked by risk

1. **Not deployed.** No public HTTPS address, no Neon database, no persistence across a redeploy, and no Google OAuth callback on a public address. This is the largest gap.
2. **Docker image not built.** The Docker daemon was not running here, so `Dockerfile` has not been built or run.
3. **No login rate limit.** Password guessing against `/api/auth/login` is not throttled.
4. **Browser UI not checked.** The four states, keyboard use, contrast, touch targets and responsive layout are unverified. Every item in `docs/UI.md` is still unticked.
5. **Dev-dependency vulnerabilities.** `npm audit` reports 7 (3 critical, 1 high, 3 moderate). `npm audit --omit=dev` reports 0, so none ship in the runtime image. Fixing them needs a breaking upgrade, which I did not apply.
6. **Model cost not measured per request.** See the model section.
7. **Request waterfall not measured.** See above.

## Model feature

- **What it does.** Turns a short request (up to 500 characters) into a suggested lab, start, end and purpose. Nothing is saved until the user presses "Use this suggestion" and then books.
- **Provider.** Google Gemini, `gemini-2.5-flash`, through `src/ai/gemini.js`. The key is sent in the `x-goog-api-key` header, never in the URL.
- **What data leaves the app.** The lab catalogue (names, locations, capacities, equipment), the current UTC time, and the user's request text. The email address, name, password and the user's existing reservations are not sent.
- **Price.** Not measured per request. The only price list in the repository is the one in `USAGE.md` (Google Gemini API, paid tier, read on 2026-10-14). One request's token count has not been recorded, so a per-request cost is not claimed here.
- **When it fails.** A timeout after `AI_TIMEOUT_MS` (8 s), a 429, a 5xx, or an answer that fails the schema shows a sentence and the form still works (`AC-16`, `AC-17`). Tested with a fake client only; the live provider was not called.

## MCP

- **Where.** `mcp-server/server.js`, started with `npm run mcp`. Its tools call the same services as the HTTP routes (`src/mcp/tools.js`).
- **Who may call.** The user whose session token is in `MCP_TOKEN`. A tool call acts as that user and gets the same 401 and 403 answers as the HTTP API (`AC-25`, `AC-26`). A missing or expired token returns an error result and does not act as anyone.
- **Not checked.** The MCP server against the deployed site. There is no deployment yet.
