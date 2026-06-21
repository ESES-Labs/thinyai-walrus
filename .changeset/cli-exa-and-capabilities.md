---
"thinyai": minor
---

- **Agent knows all its tools.** Rewrote the system prompt as a clear capabilities map (memory, links,
  web search, planning, Sui) with a strong directive: when a request maps to a tool, call it
  automatically — don't ask the user which tool to run, don't ask permission for read-only actions,
  and chain tools when needed. So users no longer have to name a tool.
- **Exa web search.** `web_search` now uses Exa (set `EXA_API_KEY`, get one at exa.ai), with Brave as
  a fallback. It's a separate tool from `fetch_url`: `web_search` finds pages by query; `fetch_url`
  reads one specific URL — both are available and the prompt explains when to use each.
- Startup line shows web status; `.env.example` documents `EXA_API_KEY`.
