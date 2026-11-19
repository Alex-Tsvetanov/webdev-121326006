# Review of the lab-reservations project

**Reviewed:** commit `fb2d943` (Exercise 4), on branch `project`.
**Stand-in peer:** this repository, as set in `course.json` (`peerRepo`). The real peer's repository was not available. Nothing was pushed, and nothing was tested against any published site.
**Ground rules followed:** local runs only, against a local Postgres 16 and a local app on port 3100. Only ordinary single requests. No scanners, no load, no password guessing.

## Method

- **Pass A (me):** I read the booking, auth and MCP code, and ran two live checks against the local database: eight and then 16 simultaneous users booking the same slot, and the health endpoint with the database stopped.
- **Pass B (a fresh Sonnet reviewer):** a separate agent with no conclusions from me. It read 17 files and reported 11 findings, B1 to B11. Its output is in the triage below.
- Each Pass B claim was checked by reading the code, and where possible by running it. Verdicts are **confirmed** (reproduced or read in the code), **false positive**, or **unsure** (not reproduced, excluded from precision).

## Findings

| ID | Finding | Severity | Evidence | Verdict | Status |
|---|---|---|---|---|---|
| R1 | Two simultaneous bookings of one slot both succeed. The overlap check and the insert are separate, and no constraint stops the second insert. | high | Live: 16 users, 10 slots, `6 of 10 slots had two bookings`, 15 rows. Before the fix: 8 of 8 simultaneous writes succeeded in `tests/r1-concurrent-booking.test.js`. (Pass A and Pass B both) | confirmed | fixed in `f4a30cf` (test `fbd76b5`) |
| R2 | The owner cannot extend a booking that has already started: the "not in the past" rule re-checks the unchanged start. | low | `src/services/reservations.js` read; failing test `tests/r2-extend-ongoing.test.js` before the fix | confirmed | fixed in `65846e3` (test `00d0c7d`) |
| R3 | A line containing `null` crashes the MCP server (`TypeError: Cannot read properties of null`, exit 1). | medium | Run: `printf 'null\n…' \| node mcp-server/server.js` exits 1. Test `tests/r3-mcp-null.test.js` failed with exit 1 before the fix | confirmed | fixed in `2a692f7` (test `afa723a`) |
| R4 | A `sid` cookie with broken percent-encoding returns 500 instead of signed out. | low | `curl -H 'Cookie: sid=%E0' /api/auth/me` returned 500. Test `tests/r4-malformed-cookie.test.js` failed (`expected 500 to be 401`) | confirmed | fixed in `6f22cbf` (test `a60719b`) |
| R5 | **Authorization.** Signing in with Google links to any existing local account with the same email if Google says the email is verified. A local account never proves its email, so an attacker who registers the victim's address first gets the victim's Google sign-in into the attacker's account. | high | `src/services/auth.js:63-69` read. Consistent with AC-4 as written | confirmed by reading; failing test `tests/r5-google-link.test.js` before the fix (the signed-out sign-in was linked) | fixed: a new Google identity links to an existing account only when the browser is already signed in to that account and Google says the email is verified. Signed out, it is refused with 409 and a sentence (AC-37). AC-4 now reads as written: "a signed-in user". The main screen has a "Link Google account" button for this |
| R6 | No throttle on sign-in, and no cap on bookings or on AI calls per user. Anyone can guess passwords, use up the model quota, or block the labs. | medium | No rate limiter anywhere in `src/` (grep for `rate` finds only the AI provider's 429 handling). `src/http/app.js:49-57`, `src/http/app.js:114-116` | confirmed by reading | fixed in the commit after `db9a995` (test `cb8d85a`): 10 sign-in attempts per email per 15 min (AC-33), 20 assistant requests per user per hour (AC-34), 10 upcoming bookings per user (AC-35). The numbers are my choice |
| R7 | **Layer.** The id check (`idParam`) lives in the HTTP route. The MCP tools skip it and pass raw ids to the service, which passes them to the database. | low | `src/http/app.js:21-25` read; `src/mcp/tools.js` passes `id` through unchanged | confirmed by reading, then run: on the local Postgres 16 an out-of-range id fails with 22003 and `NaN` with 22P02, both returned as 500. Failing test `tests/r7-id-in-service.test.js` before the fix, with a repository that fails like Postgres | fixed: the service checks every reservation and lab id (a whole number from 1 to 2 147 483 647), so HTTP and MCP both get 404 (AC-38). `idParam` is gone from the HTTP layer. Also fixed on the way: a booking with no `labId` reached Postgres as `NaN` and returned 500 |
| R8 | No browser protections: pages can be framed (clickjacking the cancel button), are sniffed, and send the full referrer. `X-Powered-By` names Express. | low | Failing test `tests/r8-headers.test.js` before the fix; response headers had none of the three | confirmed | fixed in `1a434aa` (test `04ea435`) |
| R9 | Login skips the bcrypt comparison for an unknown email, so the response is faster for an existing account. This reveals which emails are registered. | low | `src/services/auth.js:49`: `user?.password_hash && await bcrypt.compare(…)` short-circuits when there is no user | confirmed by reading; failing test `tests/r9-login-timing.test.js` (no bcrypt call for an unknown email) | fixed: an unknown email or a Google-only account is compared against a fixed bcrypt hash at the same cost (AC-39). Registration still says when an email exists (AC-2), so that route still reveals it |
| R10 | **Model.** The user's text is inserted raw into `<request>` tags, so text containing `</request>` can break out of the data block. The impact is limited: the reply is validated and the booking step checks again. | low | `src/services/ai.js:36` read | confirmed by reading; failing test `tests/r10-prompt-escape.test.js` (two closing tags in the prompt) | fixed: `<`, `>` and `&` in the user's text are sent as entities, so it cannot close the block (AC-40) |
| R11 | **UI and accessibility.** The sign-up form uses `autocomplete="current-password"`, so password managers do not offer a new password. | low | `public/index.html:29` read: one field serves sign-in and sign-up | confirmed by reading; failing test `tests/r11-signup-autocomplete.test.js` | fixed: sign-in and sign-up are two forms; the sign-up password is `new-password` and needs 8 characters (AC-41). Checked in headless Chrome, `docs/ui/02-create-account.png` |

## Accuracy by review: precision per pass

| Pass | Reported | Confirmed | False positive | Unsure (excluded) | Precision |
|---|---|---|---|---|---|
| A (my own reading and runs) | 3 (R1, R6, R11) | 3 | 0 | 0 | 3 / 3 = 100% |
| B (fresh Sonnet reviewer) | 11 items, split into 18 claims | 10 | 2 | 6 | 10 / 12 = 83% |

What the false positives were, and why I counted them:
- Pass B said registration creates accounts for unverified addresses and calls it a problem. That is the design in AC-5: an unverified address is refused only when it clashes with an existing account. Counted as false positive.
- Pass B said a 403 versus a 404 on another user's id lets a user probe which ids exist. The reviewer itself called this inherent to the design. Counted as false positive.

Unsure, not counted: a blank email from a Google profile with no email (not reproduced; Google normally sends one), a non-integer id reaching Postgres (not reproduced), the live regions being missed by screen readers, focus being lost after a cancel, a session expiring to a blank error, and a Google denial showing raw JSON. Each needs a browser or live test.

## Confirmed issues no agent found

- **The process died when the database dropped a connection.** The pool emitted an `error` event with no listener, and Node exited. Found only by running against a real Postgres during Exercise 4 (`fb2d943`, AC-32). Neither review pass reported it, because the reviewers read code and did not stop the database. Fixed.
- **Double booking through a second route.** Pass A and Pass B both found R1 by reading. No agent noticed that the update path has the same race (a move onto another booking). The fix covers both, and a test (`AC-12 R1`) proves it.

## Replies to the review of my project

- **B1 (double booking):** fixed. R1, `f4a30cf`. A database constraint now refuses overlaps, and the live test shows one booking per slot.
- **B2 (Google linking takes over a password account):** agreed, and it is the most serious item. Fixed (R5, AC-37): linking needs the browser to be signed in to the account as well as a verified Google email. The cost: someone who registers another person's address first still blocks that person from it; that needs email verification, which is a non-goal.
- **B3 (blank email, and unverified accounts):** the unverified-account part is disputed: it is the design in AC-5. The blank-email part is unsure, not reproduced.
- **B4 (no quota, open registration):** agreed. Fixed for sign-in, the assistant and bookings with limits I chose (R6, AC-33 to AC-35). Open registration itself is unchanged; it is not a rule the review asked me to tighten.
- **B5 (cannot extend an ongoing booking):** fixed. R2, `65846e3`.
- **B6 (ids reach Postgres unchecked):** agreed, reproduced on Postgres (22003 for an id above the `int` range, 22P02 for `NaN`, both a 500). Fixed in the service (R7, AC-38).
- **B7 (login timing):** agreed. Fixed (R9, AC-39).
- **B8 (prompt tag):** agreed, low impact, because the booking step checks again. The claim that the suggestion "never checks" the 8-hour limit is wrong: the booking step does. Fixed (R10, AC-40).
- **B9 (`null` crashes MCP):** fixed. R3, `2a692f7`.
- **B10 (cookie handling):** the cookie part is fixed, R4 `6f22cbf`. The Google denial page is unsure.
- **B11 (no security headers):** fixed. R8, `1a434aa`.
- **Accessibility, autocomplete:** agreed. Fixed (R11, AC-41). The other accessibility items are unsure. The main flow now works with the keyboard alone (`docs/UI.md`).
- **Clean areas the reviewer checked, which I confirmed:** no `innerHTML` in `public/app.js` (text is set with `textContent`); queries are parameterised; the MCP tools take the user from `MCP_TOKEN`, not from the arguments; cookies are `httpOnly` and `sameSite: lax`.

## Notes on the model feature and the MCP server

- **Model.** The data sent is the lab catalogue, the current UTC time and the user's request text. It is not the user's email, name, password or existing bookings. The prompt injection finding is R10, fixed. Fallbacks are covered by tests with a fake client (AC-16, AC-17).
- **MCP.** Its tools call the same services as the HTTP routes. The acting user is fixed by `MCP_TOKEN`; no tool accepts a user id. R3 (crash) and R7 (id validation in the wrong layer) are fixed.
