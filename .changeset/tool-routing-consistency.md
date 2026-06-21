---
"@thiny/core": minor
"@thiny/model-aisdk": minor
"@thiny/plugin-sui": patch
"thinyai": minor
---

Make tool routing consistent even with weaker models — important for Sui where a mis-route is a wrong
transaction.

- **Forced tool choice (`toolChoice`)** threaded through `agent.run` → `ModelProvider.generate/stream`
  → the AI SDK. `agent.run({ toolChoice })` forces the model's tool on the FIRST step (then auto).
- **Deterministic Sui fast-path:** the CLI detects unambiguous, READ-ONLY intents ("what's my
  balance", "show my wallets / address") and forces the exact tool (`sui_balances` / `sui_wallets`),
  so a weak model can't pick the wrong one. Money ops (send) are NOT forced — they go through the
  model so it can confirm first. Verified live: a balance query on MiniMax-M3 deterministically calls
  `sui_balances` and returns a clean SUI+USDC summary in ~4s.
- **Routing-rule descriptions:** the overlapping Sui tools now have USE-WHEN / NOT-FOR descriptions
  (`sui_balance` vs `sui_balances`, `sui_setup` vs `sui_create_wallet` vs `sui_import_wallet`) so the
  model disambiguates on keywords.
