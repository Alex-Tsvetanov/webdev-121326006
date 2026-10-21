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
