# Lab reservations

<!-- Exercise 2. Write the non-goals first. Every acceptance criterion must be checkable in under a minute.
     Keep these headings exactly as they are: the self-checks look for them by name.
     The full target is on the course site under Resources → The course project. -->

## Project option
Lab booking (one of the three predefined topics; name registered in Моят курс with this repository).

## Goals
- A student or staff member books, moves, and cancels their own reservations of university labs, on the web or through the MCP server, and sees which labs are free.
- A person signs in with a password or with Google, and both ways lead to one account.

## Non-goals
- No payments, deposits, or paid labs.
- No recurring bookings (weekly series) and no waiting list.
- No admin screens: labs and equipment are seeded by migrations, not edited in the app.
- No email or push notifications.
- No organisations or multi-tenancy: everyone sees the same labs.
- No offline mode and no native mobile app.

## Constraints
- Node.js 22, Express 5, PostgreSQL (Neon) with numbered SQL migrations; the frontend is plain HTML, CSS and JavaScript served by the same app.
- Deployed on Render's free web service: it sleeps when idle, so the first request can take about a minute; no persistent disk, so all data lives in Neon.
- Gemini's free quota is shared, so the model feature must work, with a readable message, when it answers 429 or is missing a key.
- Secrets (`DATABASE_URL`, `SESSION_SECRET`, Google client secret, `GEMINI_API_KEY`, `MCP_TOKEN`) are environment variables only, never committed.
- CI gate: 100% of the service layer (lines, functions, branches), 80% overall.

## The model feature
<!-- Which model, which modality, and what it does for a user. -->
- Model: Google Gemini `gemini-2.5-flash` (text in, JSON out), called over REST from `src/ai/gemini.js`; the model name is `MODEL_NAME`.
- Input: the student's short request in plain words (up to 500 characters) plus the current time and the list of labs with their location, capacity, and equipment.
- Output: one proposed booking: lab, start, end, and a short purpose. It is pre-filled into the booking form; nothing is saved until the user presses Reserve.
- When it fails: a timeout after 8 seconds, a 429, a 5xx, or a missing key shows a sentence saying the assistant is busy or unavailable, and the manual form keeps working. A reply that does not match the schema, names an unknown lab, or has times in the past is rejected and never shown as a booking.

## Auth
<!-- Local sign-in plus at least one provider. Say how an account signing in both ways stays one account. -->
- Local: email and password (at least 8 characters); the password is stored as a bcrypt hash.
- Provider: Google, OpenID Connect authorization-code flow, with the `state` value checked against a short-lived cookie.
- Linking: a Google identity links to an existing account only when Google reports the email as verified; otherwise sign-in is refused with a readable message. Each Google identity maps to one user, and both sign-in methods create the same kind of session (14 days, stored as a keyed hash).

## MCP tools
<!-- At least three tools your own MCP server exposes over this project's data.
     Each tool calls the same service functions the HTTP API calls, so the same rules apply.
     A description shorter than 20 characters is not a description. -->
| Tool | What it does | Who may call it |
| --- | --- | --- |
| list_labs | List all lab rooms with their location, capacity, and equipment so you can pick one. | Any user whose session is in MCP_TOKEN |
| list_my_reservations | List the signed-in user's lab reservations, sorted by start time, with lab names. | Any user whose session is in MCP_TOKEN |
| create_reservation | Book a free lab for the signed-in user. Times are ISO 8601 date-times and a booking can last at most 8 hours. | Any user whose session is in MCP_TOKEN |
| update_reservation | Change the start, end, or purpose of one of the signed-in user's own reservations. Other users' reservations are refused. | Only the owner of the reservation |
| cancel_reservation | Cancel one of the signed-in user's own reservations by its id. Other users' reservations are refused. | Only the owner of the reservation |
| suggest_reservation | Turn a short natural-language request into a proposed reservation. Nothing is booked; call create_reservation to confirm. | Any user whose session is in MCP_TOKEN |

The Exercise 1 tools `find_lecture` and `list_files` are not project tools and are not listed here. The MCP server never runs as an administrator: it acts as the user whose session token is in `MCP_TOKEN`.

## UI
Stack: plain HTML, CSS and JavaScript in `public/`, with design tokens (colours, spacing, radii, fonts) defined at the top of `public/styles.css`.
Screens: (1) sign-in and account creation, with a Google button; (2) the main screen with the AI suggestion box, the booking form, the lab list, and "My reservations" with cancel buttons. Every list shows loading, empty, error, and success states. The checklist for these is in `docs/UI.md`.

## Architecture
A request `POST /api/reservations` (from the booking form):
1. `public/app.js`: reads the form and calls `api('/api/reservations', …)`.
2. `src/http/app.js`: the route handler authenticates the cookie (`requireUser`) and calls `reservations.create(...)`; it turns the result into status 201, or into `{ "error": ... }` on failure.
3. `src/services/reservations.js`: checks the time range, the 8-hour limit, that the lab exists, and that nothing overlaps.
4. `src/db/pg-repo.js`: the only file with SQL (`insert into reservations …`, `findOverlapping`).
5. PostgreSQL: the `reservations` table, with the check `ends_at > starts_at` and the index from `migrations/003_reservation_index.sql`.

Where this code does not match the layering: the MCP token check (`requireMcpUser`) lives in the adapter file `src/mcp/tools.js`, not in the service layer, and `mcp-server/server.js` builds its services itself through `src/container.js`. The rule itself (a token resolves to one user) is in `src/services/auth.js`, so the adapter only asks it and does not decide anything.

## Acceptance criteria
<!-- Every criterion carries an id. A test proves it by naming that id in its title, for example
     test('AC-3 a booking that overlaps another is refused with 409', ...).
     Say who acts, what they see, and what must be true in the database. -->
- [AC-1] A new visitor who registers with an email and a password of at least 8 characters is signed in; the `users` row stores a bcrypt hash, never the password. A short password or a malformed email is refused with a sentence.
- [AC-2] A second registration with the same email (any letter case) shows "An account with this email already exists." and adds no row to `users`.
- [AC-3] A wrong password and an unknown email both show "Invalid email or password."; a Google-only account cannot sign in with a password.
- [AC-4] A signed-in user with a local account who signs in with Google and a verified email is taken into the same account: `identities` gains one row and `users` gains none.
- [AC-5] A Google sign-in whose email is not verified, and whose address already belongs to a local account, is refused with a sentence; `identities` gains no row.
- [AC-6] The same Google account always returns the same user, and a session whose user no longer exists is treated as signed out.
- [AC-7] A session token older than 14 days is refused on the next request, and the user is sent to sign in.
- [AC-8] After sign-out, the old session token no longer opens `/api/auth/me`.
- [AC-9] A booking whose end is not after its start is refused with "The end time must be after the start time."; the `reservations` table does not change.
- [AC-10] A user books lab 1 from 10:00 to 12:00; another user asking for 11:00 to 13:00 in lab 1 gets 409 and no row is added; 12:00 to 13:00 and any time in lab 2 are accepted.
- [AC-11] User B tries to cancel or change user A's reservation and gets 403 with "You can only change your own reservations."; the row is unchanged.
- [AC-12] The owner moves their own reservation to a free slot and changes its purpose; the row shows the new values, and the old slot does not block the move.
- [AC-13] A booking that starts in the past, lasts more than 8 hours, or has an unreadable date is refused with a sentence, and no row is added.
- [AC-14] The owner cancels a reservation and it disappears from "My reservations"; cancelling an unknown id gives 404 "Reservation not found."
- [AC-15] Pressing "Suggest with AI" with a valid model reply shows "Suggested: <lab>, <start> – <end>" with a "Use this suggestion" button that fills the booking form; nothing is saved.
- [AC-16] A model reply naming an unknown lab, reversed times, past times, or missing fields shows "The assistant suggested a booking we cannot accept." and no suggestion is filled in.
- [AC-17] When the provider answers 429, 5xx, or times out, the box shows a sentence such as "The AI assistant is busy." and the booking form still works.
- [AC-18] With no `GEMINI_API_KEY`, the box shows that the assistant is not set up, and no request leaves the server.
- [AC-19] Submitting an empty or 501-character request shows a sentence and makes no model call.
- [AC-20] Any `/api/...` route without a session returns 401 "Please sign in to continue."; an unknown `/api/...` path returns 404 as JSON.
- [AC-21] A signed-in user books a free slot and sees it in their list; a clash returns 409 with a sentence, and malformed JSON returns 400 with a sentence.
- [AC-22] A script that sends `Authorization: Bearer <token>` from `POST /api/auth/token` reads `/api/auth/me`; after logout the same token returns 401.
- [AC-23] The Google callback without the matching `state` cookie shows "Sign-in expired. Please try again."; without Google configured, `/auth/google` answers 503 with a sentence.
- [AC-24] `tools/list` on the MCP server returns `find_lecture`, `list_files` and the six project tools, each with a description of at least 20 characters.
- [AC-25] Calling `create_reservation` through MCP books exactly what the HTTP route books, and `cancel_reservation` on another user's booking returns an error result with "You can only change your own reservations."
- [AC-26] The MCP server with no `MCP_TOKEN`, or an expired one, returns an error result "MCP_TOKEN is missing or expired." and does not start acting as anyone.
- [AC-27] The Google authorization URL contains the `state` and the exact `redirect_uri`; a failed token or userinfo call shows "Google sign-in failed. Please try again."
- [AC-28] With no environment variables, the app uses port 3000, Gemini model `gemini-2.5-flash` and an 8-second AI timeout; with `SESSION_SECRET` empty, the services refuse to start.

### Slice 1: sign-in and labs list
Done when AC-1 to AC-8 and AC-20 pass: a visitor registers, signs in, sees the labs list, and signs out.

## Traceability
<!-- Filled in from Exercise 3 onward: each AC id, and the test that names it. -->
| Criterion | Test |
| --- | --- |
| AC-1 | `tests/auth.test.js`, `tests/rule-edges.test.js` |
| AC-2 | `tests/auth.test.js` |
| AC-3 | `tests/auth.test.js`, `tests/rule-edges.test.js` |
| AC-4 | `tests/auth.test.js` |
| AC-5 | `tests/auth.test.js` |
| AC-6 | `tests/auth.test.js`, `tests/rule-edges.test.js` |
| AC-7 | `tests/auth.test.js` |
| AC-8 | `tests/auth.test.js` |
| AC-9 | `tests/reservations.test.js`, `tests/rule-edges.test.js` |
| AC-10 | `tests/reservations.test.js` |
| AC-11 | `tests/reservations.test.js` |
| AC-12 | `tests/reservations.test.js`, `tests/rule-edges.test.js` |
| AC-13 | `tests/reservations.test.js` |
| AC-14 | `tests/reservations.test.js` |
| AC-15 | `tests/ai.test.js`, `tests/rule-edges.test.js` |
| AC-16 | `tests/ai.test.js` |
| AC-17 | `tests/ai.test.js` |
| AC-18 | `tests/ai.test.js` |
| AC-19 | `tests/ai.test.js`, `tests/rule-edges.test.js` |
| AC-20 | `tests/http.test.js` |
| AC-21 | `tests/http.test.js` |
| AC-22 | `tests/http.test.js` |
| AC-23 | `tests/http.test.js` |
| AC-24 | `tests/mcp.test.js` |
| AC-25 | `tests/mcp.test.js` |
| AC-26 | `tests/mcp.test.js` |
| AC-27 | `tests/integrations.test.js`, `tests/rule-edges.test.js` |
| AC-28 | `tests/integrations.test.js`, `tests/rule-edges.test.js` |

## Spec vs result
- The first version of the MCP server used an SDK. The course rule for Exercise 1 is a hand-written protocol loop, so the project tools were ported into `mcp-server/server.js`, which keeps its own loop; the SDK dependency was dropped. The tool logic stayed in `src/mcp/tools.js`.
- The spec's AC-24 originally named `list_labs` and `list_my_reservations` as the two Exercise 1 tools. The Exercise 1 server actually has `find_lecture` and `list_files`, so AC-24 counts those and the six project tools.
- The service-layer coverage gate (100%) first failed on branches of the auth and reservation rules; tests for those branches were added in `tests/rule-edges.test.js` instead of lowering the gate.
- `SESSION_SECRET` is now required: it keys the session-token hash, so a leaked `sessions` table cannot be used as cookies.
