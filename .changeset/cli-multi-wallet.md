---
"thinyai": minor
---

Multi-wallet awareness + management. The agent now knows every wallet the user has and can manage
them from chat:

- `sui_wallets` — list all agent wallets (addresses) + the Rill MCP signer if connected. Answers
  "what's my address / what wallets do I have".
- `sui_create_wallet` — generate a new key pair (add an address).
- `sui_import_wallet` — restore a wallet from a `suiprivkey…`.
- `sui_export_wallet` — reveal a wallet's private key for backup (sensitive, on request).
- `sui_use_wallet` — switch the active signing wallet.

Config now stores a `wallets[]` array + `activeAddress`; the legacy single-wallet shape is migrated
transparently. The system prompt lists these so the agent uses them automatically.
