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
- **Two bookings at the same moment.** Checked on the local database: 16 users booking 9 slots at once left one booking per slot. Before the fix, 6 of 10 slots were double-booked. The fix is a database constraint (migration 004, AC-10).
- **API while the database is down.** Returns 500 with one sentence and no stack trace (`AC-31`, `tests/errors.test.js`).
- **Malformed JSON.** Returns 400 with a sentence. Checked by hand with `curl`.
- **Unknown page.** Returns a one-line 404. Checked by hand with `curl`. Unknown `/api/` paths return JSON 404.
- **Too many sign-in attempts or assistant requests.** Return 429 with a sentence (`AC-33`, `AC-34`, `tests/r6-limits.test.js`).
- **Model provider down, slow, or rate-limited.** The box shows a sentence and the booking form still works (`AC-16`, `AC-17`, a fake client in `tests/ai.test.js`). The live provider was not called.

## The four states of one screen

Checked in the built-in browser on the local app, on the reservations screen:

- **Loading:** "Loading labs…" and "Loading your reservations…" appeared while the requests were slowed by 2.5 s. How I checked: page text while the requests were pending. Not captured as a screenshot; the 100 ms target was not measured.
- **Empty:** "You have no reservations yet." on a new account.
- **Error:** "This lab is already reserved for part of that time." after an overlapping booking.
- **Success:** "Lab reserved." and the booking in "My reservations" with no reload.

The evidence and the items not checked are in `docs/UI.md`.

## Request waterfall

Measured from the browser's network log on one fresh page load, after sign-in:

1. `GET /` (the HTML)
2. `GET /styles.css` and `GET /app.js` in parallel, once the HTML arrives
3. `GET /api/auth/me`, once `app.js` runs
4. `GET /api/labs` and `GET /api/reservations` after `/api/auth/me` returns 200

So a signed-in visit makes three request rounds before the lists fill in. The timings were not captured, and the run was local, so the numbers would not mean much on a real network.

## Security basics

- Passwords are stored as bcrypt hashes (`AC-1`). Sessions are stored as keyed hashes, so a leaked table cannot be used as cookies (`SESSION_SECRET` keys the hash).
- Cookies are `httpOnly` and `sameSite: lax`, and `secure` when `PUBLIC_BASE_URL` is https (`src/http/app.js`). A malformed cookie is treated as signed out (`R4`).
- A user cannot change another user's reservation: the rule is in the service and returns 403 (`AC-11`).
- Sign-in attempts are limited to 10 per email per 15 minutes (`AC-33`). The assistant is limited to 20 requests per user per hour (`AC-34`). A user cannot hold more than 10 upcoming bookings (`AC-35`). These limits are in memory, so they start again after a restart.
- Browser protections are on every response: no framing (`X-Frame-Options: DENY`), no MIME sniffing, and a same-origin referrer policy (`R8`, `tests/r8-headers.test.js`).
- The Docker image runs as the `node` user, not root, and `.dockerignore` keeps `.env` out of the image. Not built, see the gaps.
- Not done: registration is not limited, and there is no CSRF token; `sameSite: lax` and JSON-only writes are the only protection against cross-site writes. A Google sign-in can link to a password account that never proved its email (R5, see the gaps).

## Known gaps, ranked by risk

1. **Not deployed.** No public HTTPS address, no Neon database, no persistence across a redeploy, and no Google OAuth callback on a public address. This is the largest gap, and it needs your accounts.
2. **Google sign-in can take over a password account (R5).** A Google sign-in with a verified email links to an existing password account with the same email, even though nothing proved that the password account owns that email. Fixing it needs email verification for password accounts, or a decision to stop linking. Open.
3. **Docker image not built.** The Docker daemon was not running here, so `Dockerfile` has not been built or run.
4. **UI items not checked.** Nothing moves while the page loads (not measured). The main flow has not been tried with the keyboard alone: booking was done with the mouse. The assistant's suggestion has not been seen on screen, because there is no API key here. No screenshot files are saved.
5. **Limits are in memory.** They reset on restart and are not shared between instances.
6. **Open review findings.** R7: the id check lives in the HTTP layer, so MCP tools skip it. R9: a login with an unknown email skips the password comparison, which reveals which emails are registered. R10: user text can close the `<request>` tag in the assistant prompt. R11: the sign-up form uses `current-password` autocomplete.
7. **Dev-dependency vulnerabilities.** `npm audit` reports 7 (3 critical, 1 high, 3 moderate). `npm audit --omit=dev` reports 0, so none ship in the runtime image. Fixing them needs a breaking upgrade, which I did not apply.
8. **Model cost not measured per request.** See the model section.

## Model feature

- **What it does.** Turns a short request (up to 500 characters) into a suggested lab, start, end and purpose. Nothing is saved until the user presses "Use this suggestion" and then books.
- **Provider.** Google Gemini, `gemini-2.5-flash`, through `src/ai/gemini.js`. The key is sent in the `x-goog-api-key` header, never in the URL.
- **What data leaves the app.** The lab catalogue (names, locations, capacities, equipment), the current UTC time, and the user's request text. The email address, name, password and the user's existing reservations are not sent.
- **Price.** Not measured per request. The only price list in the repository is the one in `USAGE.md` (Google Gemini API, paid tier, read on 2026-10-14). One request's token count has not been recorded, so a per-request cost is not claimed here.
- **When it fails.** A timeout after `AI_TIMEOUT_MS` (8 s), a 429, a 5xx, or an answer that fails the schema shows a sentence and the form still works (`AC-16`, `AC-17`). Tested with a fake client only; the live provider was not called. Each user is limited to 20 requests an hour (`AC-34`).

## MCP

- **Where.** `mcp-server/server.js`, started with `npm run mcp`. Its tools call the same services as the HTTP routes (`src/mcp/tools.js`).
- **Who may call.** The user whose session token is in `MCP_TOKEN`. A tool call acts as that user and gets the same 401 and 403 answers as the HTTP API (`AC-25`, `AC-26`). A missing or expired token returns an error result and does not act as anyone. A line that is not a JSON object gets an error reply and does not stop the server (`R3`).
- **Not checked.** The MCP server against the deployed site. There is no deployment yet.
