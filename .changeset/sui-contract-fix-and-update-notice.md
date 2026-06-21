---
"@thiny/plugin-sui": patch
"thinyai": patch
---

- **Fix the `sui_execute_ptb` wire contract.** It had drifted to a base64 `unsignedPtb`; the canonical
  contract (Rill spec, serialization test, smoke) is `unsignedTx` = the JSON string from
  `Transaction.toJSON()`, deserialized with `Transaction.from(unsignedTx)`. Aligned the tool, tests,
  README, and smoke. All three transaction tools are now verified live on testnet:
  `sui_execute_ptb`, `sui_transfer`, `sui_move_call` (incl. `gas`/pure args + type args).
- **Agent knows its Sui tools.** The system prompt now lists `sui_transfer` / `sui_move_call` / etc.
  and explicitly tells the agent NOT to suggest a browser wallet — it transacts with its own tools.
- **Update notice.** On startup the CLI shows `Update available: X → Y — run \`thiny update\`` from a
  cached npm check (instant; refreshed in the background, fail-silent).
