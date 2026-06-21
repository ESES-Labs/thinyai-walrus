---
"@thiny/plugin-sui": patch
"thinyai": patch
---

Fix `sui_transfer` for non-SUI coins (e.g. USDC). It now resolves the requested coinType against
the coins the wallet actually holds (full type, symbol, or partial), and returns clean terminal
results instead of throwing — so a weak model gets a readable message rather than looping on a raw
`tool_result_not_json` error. When the balance index reports a coin but the RPC returns no spendable
coin objects (lagging node or locked coins), the tool says so plainly instead of failing opaquely.
