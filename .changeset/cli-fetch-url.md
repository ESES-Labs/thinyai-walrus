---
"thinyai": minor
---

Add a `fetch_url` tool (always on) so the agent can read links the user shares — a `skill.md`, docs,
JSON, or an API/MCP endpoint — instead of replying that it can't open URLs. Returns the response text
(truncated for large bodies). `web_search` is also enabled automatically when `BRAVE_API_KEY` is set.
The system prompt now instructs the agent to fetch any shared URL. (Sui tx tools — `sui_execute_ptb`,
`sui_transfer`, `sui_move_call` — re-verified live on testnet.)
