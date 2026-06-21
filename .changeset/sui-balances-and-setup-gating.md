---
"thinyai": minor
---

Sui UX hardening:

- **`sui_balances`** — fetch ALL coin balances across ALL of the user's addresses on a chosen network
  (SUI shown in whole SUI). Answers "what's my balance / what coins do I have".
- **Setup gating** — when Sui isn't configured the agent first asks whether to set it up and for the
  network + wallet option (same as `thiny sui init`), then calls `sui_setup`; it won't attempt other
  Sui tools until setup succeeds.
- **Primary wallet** — the agent knows the active (primary) wallet and asks the user if it's unclear;
  adding a wallet never overwrites existing ones (multi-wallet store).
- **Readable errors** — the prompt directs the agent to explain Sui tool failures in one plain
  sentence (no raw JSON), present balances/results readably, and keep answers brief.

All Sui tools battle-tested live on testnet (reads, transfer, move_call, execute_ptb, getAllBalances).
