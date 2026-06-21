---
"thinyai": minor
---

Wire the Sui execution layer into the CLI agent. Previously `thiny sui init` saved a wallet but the
agent never gained any Sui tools. Now, when a Sui key is configured (via `thiny sui init` or
`SUI_SECRET_KEY`), the CLI builds a `suiSigner` and registers `suiPlugin` — giving the agent
`sui_balance`, `sui_object`, and the gated `sui_execute_ptb`. If a Rill MCP URL is set, `mcpHttpPlugin`
is added too (its tools build the unsigned PTBs the agent signs). The system prompt tells the agent it
can transact on Sui, and a startup line shows `Sui: <network> · <address>`.
