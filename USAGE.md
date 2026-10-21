# Usage

One row per agent session. In Gemini CLI, type `/stats` before you quit and copy the input and output tokens. Copilot shows credits instead of tokens: write those in the credits column. The free tier charges nothing, so record what the session **would cost at the provider's published list price**, and note once below the table which price list you used. Leave the cost empty for rows that only show credits.

| Date | Tool | Input tokens | Output tokens | Credits (if no tokens) | List-price cost |
|---|---|---|---|---|---|
| 2026-10-14 | Gemini CLI | 27 728 | 87 | | $0.02 |
| 2026-10-21 | Gemini CLI | 0 | 0 | | $0.00 |

The 2026-10-21 row is the interactive session after `/stats`: 0 tool calls, 4m 43s wall time, and no successful model requests. The headless `gemini -p` attempt the same day failed with "fetch failed" before any tokens were counted, so it is not in this row either.

Price list: Google Gemini API pricing, paid tier, standard rates per 1M tokens, as read on 2026-10-14 (https://ai.google.dev/gemini-api/docs/pricing). The session used `gemini-3.8-flash` ($0.75 input, $3.75 output: 25 856 in, 49 out, $0.0196) and `gemini-3.5-flash-lite` ($0.30 input, $2.50 output: 1 872 in, 38 out, $0.0007). Total $0.0202, shown as $0.02. The token counts are the sum of both models from `/stats`. The free tier charged nothing.
