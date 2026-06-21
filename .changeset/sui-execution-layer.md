---
"@thiny/signer-sui": minor
"@thiny/plugin-sui": minor
"@thiny/mcp": minor
---

Sui execution layer for grounded agent transactions (Rill flagship):

- `@thiny/signer-sui`: generalize into a reusable `suiSigner` (`address` / `devInspect` / `signAndExecute`
  / `client` + **mainnet guard off by default**). `suiMemoryHead` is rebuilt on top with its public API
  unchanged.
- `@thiny/plugin-sui` (new): `sui_balance`, `sui_object`, and the gated `sui_execute_ptb` — deserialize a
  builder's unsigned PTB → re-simulate (`devInspect`) → soft policy → approval gate → sign → submit.
  Protocol-agnostic (signs whatever bytes it's given; hard caps are on-chain).
- `@thiny/mcp`: add `mcpHttpPlugin` — consume a **hosted** MCP server by URL (streamable HTTP), so a
  user can paste a Rill MCP link and the agent's tools light up.

Tests are real (no fakes): live Sui testnet `devInspect`/reads (env-gated `SUI_LIVE_TESTS`) and a real
in-process MCP server over HTTP for the client round-trip.
