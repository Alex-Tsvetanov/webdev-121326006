# Usage

One row per agent session. In Gemini CLI, type `/stats` before you quit and copy the input and output tokens. Copilot shows credits instead of tokens: write those in the credits column. The free tier charges nothing, so record what the session **would cost at the provider's published list price**, and note once below the table which price list you used. Leave the cost empty for rows that only show credits.

| Date | Tool | Input tokens | Output tokens | Credits (if no tokens) | List-price cost |
|---|---|---|---|---|---|
| 2026-10-14 | Gemini CLI | 27 728 | 87 | | $0.02 |
| 2026-10-21 | Gemini CLI | 0 | 0 | | $0.00 |
| 2026-10-21 | Claude Code, Claude Haiku 5.5: the "Side chat" session that built the project in a separate folder before the port | 19 551 783 | 172 027 | | $1.51 |
| 2026-10-21 | Claude Code: port into this repository (AGENT_LOG session 1) | not recorded | not recorded | | not recorded |
| 2026-10-21 | Claude Code: Exercise 4 (AGENT_LOG session 2) | not recorded | not recorded | | not recorded |
| 2026-10-21 | Claude Code: Exercise 5 review and fixes (AGENT_LOG session 3) | not recorded | not recorded | | not recorded |
| 2026-10-28 | Claude Code: R6 limits and UI check (AGENT_LOG session 4) | not recorded | not recorded | | not recorded |
| 2026-11-19 | Claude Code, Claude Opus 5.5: review comments, R5 to R11, AI fix, UI evidence (AGENT_LOG session 5) | 27 464 700 | 134 554 | | $10.85 |

The 2026-10-21 row is the interactive session after `/stats`: 0 tool calls, 4m 43s wall time, and no successful model requests. The headless `gemini -p` attempt the same day failed with "fetch failed" before any tokens were counted, so it is not in this row either.

Price list: Google Gemini API pricing, paid tier, standard rates per 1M tokens, as read on 2026-10-14 (https://ai.google.dev/gemini-api/docs/pricing). The session used `gemini-3.8-flash` ($0.75 input, $3.75 output: 25 856 in, 49 out, $0.0196) and `gemini-3.5-flash-lite` ($0.30 input, $2.50 output: 1 872 in, 38 out, $0.0007). Total $0.0202, shown as $0.02. The token counts are the sum of both models from `/stats`. The free tier charged nothing.

## Claude Code sessions

Claude Code wrote most of this repository: the four sessions in `AGENT_LOG.md` produced about 6 500 lines. Their numbers come from the session transcripts Claude Code keeps on this machine (`~/.claude/projects/…/<session>.jsonl`), where every model request records its token usage.

- **Where the numbers are, and where they are not.** Two transcripts exist: the 2026-10-21 "Side chat" (run in the `Programming-for-web` folder, 82 model requests) and the 2026-11-19 session (109 requests when its row was written, near the end; the last few requests are not in it). The transcripts of the four sessions in `AGENT_LOG.md` are no longer on this machine, so their rows say "not recorded" instead of a guess. The 2026-11-05 commits (`bcaa18b`, `8c54375`) have no `AGENT_LOG.md` entry and no transcript either.
- **How the input column is counted.** It is everything the model read: new input, plus prompt-cache writes, plus prompt-cache reads. Claude Code sends the whole conversation on every request and caches it, so almost all of it is cache reads. Side chat: 170 new, 278 648 cache writes, 19 272 965 cache reads. 2026-11-19: 226 new, 342 162 cache writes, 27 122 312 cache reads. The roughly 30 Gemini calls this session made to diagnose the assistant were a few hundred tokens each, under a cent in all, and are not in the table.
- **Price list.** Anthropic API pricing, standard rates per 1M tokens, read on 2026-11-19 (https://platform.claude.com/docs/en/about-claude/pricing). Claude Opus 5.5: $4 input, $8 one-hour cache write, $0.20 cache read, $20 output. Claude Haiku 5.5: $0.10 input, $0.20 one-hour cache write, $0.01 cache read, $0.50 output for prompts up to 100 000 tokens, and $0.50, $1, $0.05, $2.50 above that. Each request was priced on its own, at the rate for its own prompt size (77 of the 82 Side chat requests were above 100 000 tokens). Claude Code writes its cache with the one-hour lifetime, and the transcripts record no five-minute writes.
- **What the column means.** As for the Gemini rows, the cost column is what these tokens cost at the published list price. What the Claude plan they ran under actually charged is not recorded here.
