# Agent log

One entry per agent session, newest at the bottom. Be honest: what went wrong is the useful part.

<!-- Copy this block for each session:

## YYYY-MM-DD · <short title>
- Goal:
- Delegated:
- Checkpoints:
- Went wrong:
- Changed by hand:

-->

## 2026-10-21 · Port the lab-reservations project into the course repo
- Goal: move the lab-reservations project (built in a separate folder) into this repository on branch `project`, shaped to the course template: SPEC headings, `mcp-server/server.js`, `course.json` `mcp` command, the coverage gate, and `npm test`.
- Delegated: nothing; one agent session, Claude Code.
- Checkpoints: the Exercise 1 MCP conformance check passes (12/12). `npm test` runs 37 unit tests and the MCP check. Coverage: service layer 100% lines, functions, branches, statements; overall 97%. `node checks/ex2.mjs` still fails until the criteria and the manual items below are filled in.
- Went wrong: the first version used the MCP SDK, which the course rules do not allow for Exercise 1, so the protocol loop was kept hand-written and the SDK dropped. The service layer first failed the 100% branch gate, and tests were added rather than lowering the gate. A tool-list design that built services at import time broke the Exercise 1 check; the metadata is now separate from the bound services. `npm install` reported vulnerabilities; `npm audit fix --force` was not run, because it changes dependencies.
- Changed by hand: none yet. Still to do by the user: fill in `USAGE.md` from `/stats`, complete the `docs/UI.md` evidence, and run the app against Neon and Render.

## 2026-10-21 · Exercise 4: startup checks, health, errors, and a readiness report
- Goal: make the project deployable from the code side (env validation, `/health`, error responses, Dockerfile, coverage gate) and write an honest `READINESS.md`.
- Delegated: nothing. One agent session, Claude Code, on branch `project`.
- Checkpoints: `npm run coverage` passes (42 tests; service layer 100% lines, functions, branches, statements; overall 97.7%). The app ran against a local Postgres 16: `/health` 200, then 503 with the process still alive, then 200 after restart. Startup with no environment exits with a sentence. The Docker image is not built: the Docker daemon was not running.
- Went wrong: stopping Postgres crashed the app (an unhandled pool `error` event). The unit tests had not caught it, because they never run a real database. Found only by the live run; fixed in `createPool` with AC-32. `checks/ex4.mjs` reports "CI enforces the threshold" as passing, but only because the template's `ci.yml` contains unused Node-runner fallback flags. The real gate is the Vitest thresholds in `vitest.config.js`, which CI runs through `npm run coverage`. Also: the first draft of this entry said the check failed; it passes.
- Changed by hand: none. Not yet done by the user: the Neon database, the Render deploy, the live `liveUrl`, the OAuth callback, the browser pass on `docs/UI.md`, and the `USAGE.md` `/stats` row for this session.

## 2026-10-21 · Exercise 5: review of a project, and fixes test-first
- Goal: review a project as an attacker would, with two independent passes, triage the findings, and fix the confirmed ones with a failing test committed first.
- Delegated: one fresh Sonnet reviewer (Pass B) with the code and no conclusions from me. It returned 11 items. Its claims were checked by reading and by running them, and the verdicts are in `REVIEW.md`.
- Checkpoints: commits `fbd76b5` test(R1) then `f4a30cf` fix(R1); `00d0c7d` test(R2) then `65846e3` fix(R2); `a60719b` test(R4) then `6f22cbf` fix(R4); `afa723a` test(R3) then `2a692f7` fix(R3); `04ea435` test(R8) then `1a434aa` fix(R8). Each test was run and seen to fail before its fix. `npm test` passes (49 tests, 12/12 MCP check). `npm run coverage` passes: services 100%, overall above 97%. The R1 migration was applied to local Postgres and the stress test shows one booking per slot.
- Went wrong: the first R1 test passed for the wrong reason. The service's own pre-check caught the clash before the database path ran, so the update-path coverage was missing. The test now simulates the race by stubbing the pre-check. The first live stress run reported 400s for slot 10, which was my script writing an invalid date, not the app.
- Changed by hand: none. Open for the user: R5 (Google linking, changes AC-4) and R6 (throttle and cap) need a decision before they change. `DEFENSE.md` is not written; it must be written in the student's own words. The CI red-then-green check needs a push, which has not been done.
