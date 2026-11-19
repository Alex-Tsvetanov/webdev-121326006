# Readiness

This report says what is verified, what is not, and how I checked each claim. Anything
without a "How I checked" note is not claimed.

## Live URL

https://webdev-121326006.onrender.com, on Render's free web service. `course.json` names it in `liveUrl`.

- How I checked, on 2026-11-19: `GET /health` answered 200 `{"status":"ok"}` in 3.8 s, so the app is up and its database answers. `node checks/ex4.mjs` passes its three live checks (health 200, the site serves a page, the page has a real title). `GET /auth/google` answers 302 to Google's sign-in page with `redirect_uri=https://webdev-121326006.onrender.com/auth/google/callback`, so Google sign-in is configured for the public address.
- Checked on the live site on 2026-11-19, after the deploy of `4db265d`: Render builds the `project` branch with auto-deploy, and its events page shows `4db265d` live at 11:02. In a browser signed in to an existing account, "Suggest with AI" showed a suggestion after 4.2 s (gap 1), and a booking made on 2026-11-16 was still listed after the redeploy, so bookings survive a redeploy. Not checked on the live site: making or cancelling a booking, Google sign-in and linking to the end, and the MCP server against it.
- To check again: `node checks/ex4.mjs` (it reads `liveUrl`).
- Most of the rest of this page was checked locally, on `http://localhost:3100` against a local Postgres 16; each item says so.

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
| `MODEL_NAME` | no | `gemini-3.6-flash` |
| `AI_TIMEOUT_MS` | no | 15000 |
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
- **Model provider down, slow, or rate-limited.** The box shows a sentence and the booking form still works (`AC-16`, `AC-17`, a fake client in `tests/ai.test.js`). Seen on screen with a local stand-in that answers 429 (`docs/ui/08-assistant-failed.png`). The live provider was not called from here.
- **An id that is not a whole number, or too large for the database.** Returns 404 "Reservation not found." or "Lab not found." from the service, through HTTP and MCP alike (`AC-38`, R7). Checked against the local Postgres 16: without the check, those ids reach the database and fail with errors 22003 and 22P02, which the app returns as 500.

## The four states of one screen

Checked in the built-in browser on the local app, on the reservations screen, and again on 2026-11-19 in headless Chrome, which saved the screenshots in `docs/ui/`:

- **Loading:** "Loading labs…" and "Loading your reservations…" appeared while the requests were slowed by 2.5 s. How I checked: page text while the requests were pending, and `docs/ui/09-loading.png`. The 100 ms target was not measured. Layout shift while the lists fill in was 0 to 0.0025.
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
- A Google sign-in links to an existing account only when the browser is already signed in to that account and Google says the email is verified. A signed-out Google sign-in whose email belongs to a password account is refused with a sentence, because a password account never proved it owns its email (`AC-4`, `AC-37`, R5).
- A sign-in with an unknown email runs the same bcrypt comparison as a wrong password, so its response time does not say whether the email is registered (`AC-39`, R9).
- The user's text reaches the model inside a `<request>` block, with `<`, `>` and `&` sent as entities, so it cannot close the block and write instructions after it (`AC-40`, R10). The model's answer is still checked against the database before it is shown.
- Not done: registration is not limited, and there is no CSRF token; `sameSite: lax` and JSON-only writes are the only protection against cross-site writes.

## Known gaps, ranked by risk

1. **On the live site the main model refuses, and every suggestion comes from the fallback.** "Suggest with AI" timed out there before 2026-11-19. Measured on 2026-11-19 with the real key, from this machine: `gemini-3.6-flash` answered 503 "high demand", 429, or nothing within 60 s on nearly every try, and `gemini-3.1-flash-lite` answered in 1 to 2 s every time. The thinking setting was not the cause (both `minimal` and `thinkingBudget: 0` used 0 thinking tokens). The adapter now sends the request on to `gemini-3.1-flash-lite` when the main model is busy, unreachable, or has not answered in half the timeout (AC-42). On the live site after the deploy, a suggestion appeared after 4.2 s, and Render's log for it reads `Gemini is busy: HTTP 429`, then `Gemini gemini-3.6-flash failed (rate_limited); trying gemini-3.1-flash-lite`. The 429 may be the key's quota for `gemini-3.6-flash`, partly used up by the diagnosis calls that day; that was not checked in Google's console. The log no longer shows the reviewer's original failure: a search for "Gemini" over the last 7 days finds only those two lines, and the 30-day view shows no lines at all. When both models fail, the box says why and the booking form keeps working (`AC-17`, `AC-36`).
2. **Some flows are not checked on the live site.** Making and cancelling a booking, Google sign-in and linking to the end, and the MCP server against the live site were checked locally only. Signing in, the assistant, and bookings surviving a redeploy were checked live.
3. **Docker image not built.** The Docker daemon was not running here, so `Dockerfile` has not been built or run. How Render builds the service was not checked from here.
4. **An address can be taken first.** Anyone can register any email address with a password, and nothing checks that they own it. Since R5 that no longer lets them receive the real owner's Google sign-in, but the owner can then neither register nor sign in with Google under that address. Fixing it needs email verification, which the spec's non-goals exclude.
5. **Registration still says which emails exist.** Sign-in no longer does (R9), but "An account with this email already exists." on registration (AC-2) does, and registration is not limited.
6. **Limits are in memory.** They reset on restart and are not shared between instances.
7. **A refused Google sign-in shows a JSON line.** The callback is a browser redirect, but its errors (for example the R5 refusal) come back as `{"error": "…"}`, not as a page. The sentence is readable; the format is not friendly.
8. **The 500 handler logs the whole error object.** A database error can contain a value, such as an email address, which then reaches Render's log (see SPEC.md, "Data that leaves the application").
9. **Dev-dependency vulnerabilities.** `npm audit` reports 7 (3 critical, 1 high, 3 moderate). `npm audit --omit=dev` reports 0, so none ship in the runtime image. Fixing them needs a breaking upgrade, which I did not apply.
10. **Slow answers when the main model hangs.** The fallback waits half the timeout (7.5 s) before it tries `gemini-3.1-flash-lite`. Setting `MODEL_NAME=gemini-3.1-flash-lite` on Render skips that wait, at the cost of a smaller model.
11. **Suggested times assume UTC.** The prompt gives the current time in UTC and not the user's time zone, so "10:00" came back as 10:00 UTC, which a browser in Bulgaria shows as 12:00. The user sees the time before booking, but it is wrong by the zone offset. Seen on the live site: asked for 10:00 to 12:00, it suggested 12:00 to 14:00.

The review findings R5, R7, R9, R10 and R11 are fixed (see REVIEW.md). Each has a test that failed before its fix.

## Model feature

- **What it does.** Turns a short request (up to 500 characters) into a suggested lab, start, end and purpose. Nothing is saved until the user presses "Use this suggestion" and then books.
- **Provider.** Google Gemini, `gemini-3.6-flash`, with `gemini-3.1-flash-lite` as the fallback when it is busy or slow (AC-42), through `src/ai/gemini.js`. The key is sent in the `x-goog-api-key` header, never in the URL. The request asks for JSON and for the `minimal` thinking level. A model that does not offer `minimal` answers 400, and the server log names Google's reason.
- **What data leaves the app.** The lab catalogue (names, locations, capacities, equipment), the current UTC time, and the user's request text. The email address, name, password and the user's existing reservations are not sent.
- **Price.** Measured on 2026-11-19 with `npm run ai:probe`: one suggestion is about 220 prompt tokens and 62 to 80 answer tokens, with 0 thinking tokens. At Google's paid-tier prices read the same day (https://aistudio.google.com/docs/pricing): `gemini-3.6-flash` $0.75 in and $3.75 out per 1M tokens (doubling on 2027-01-01) makes about $0.0004 a suggestion; `gemini-3.1-flash-lite` $0.25 and $1.50 makes about $0.0002. Both models also have a free tier. A request that ran into the timeout may still be billed by Google; that was not checked.
- **When it fails.** A timeout after `AI_TIMEOUT_MS` (15 s), a 429, a 5xx, or an answer that fails the schema shows a sentence and the form still works (`AC-16`, `AC-17`). Tested with a fake client, and on screen with a local stand-in for Gemini; the live provider was not called from here. Each user is limited to 20 requests an hour (`AC-34`).
- **How to check it against the real model.** `npm run ai:probe` reads `GEMINI_API_KEY`, `MODEL_NAME` and `AI_TIMEOUT_MS` from the environment or `.env`, sends one fixed request with the seed labs (no user data), and prints each model it tried with its HTTP status, time and `usageMetadata` (prompt, answer and thinking tokens), then the app's answer. It never prints the key. On Render, the log line for a failure names the cause: `Gemini request failed before an answer: TimeoutError` (too slow), `Gemini is busy: HTTP 429` or `HTTP 503` (quota or high demand), or `Gemini answered HTTP 400: …` (refused, with Google's reason), followed by `Gemini gemini-3.6-flash failed (…); trying gemini-3.1-flash-lite` when the fallback runs. With no key, nothing is logged and the box says the assistant is not set up.

## MCP

- **Where.** `mcp-server/server.js`, started with `npm run mcp`. Its tools call the same services as the HTTP routes (`src/mcp/tools.js`).
- **Who may call.** The user whose session token is in `MCP_TOKEN`. A tool call acts as that user and gets the same 401 and 403 answers as the HTTP API (`AC-25`, `AC-26`). A missing or expired token returns an error result and does not act as anyone. A line that is not a JSON object gets an error reply and does not stop the server (`R3`).
- **Ids.** The service checks every id, so a tool call with an id that is not a whole number, or is too large for the database, gets "Reservation not found." like the HTTP API, instead of a database error (`AC-38`, R7).
- **Not checked.** The MCP server against the deployed site. It needs a session token from an account on the live site.
