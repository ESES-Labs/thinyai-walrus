---
"@thiny/plugin-sui": minor
"thinyai": minor
---

Give the CLI agent full, self-service Sui capability.

- The Sui tools (`sui_balance`, `sui_object`, `sui_execute_ptb`) are **always registered** — until a
  wallet exists they tell the agent/user to run setup.
- New **`sui_setup`** tool lets the agent configure Sui **from chat** ("create a wallet" / "enable
  sui" / "import my key"): modes `generate` (new local key), `import` (a `suiprivkey…`), or `rill`
  (save a Rill MCP signer URL). It persists to `~/.thiny/config.json` and activates **in-session**
  (no restart) for the local agent wallet.
- `suiPlugin` now accepts a signer **getter** (`signer: SuiSigner | (() => SuiSigner | null)`), so the
  signer can be set/swapped at runtime.
- When a Rill MCP URL is set, `mcpHttpPlugin` connects its PTB-builder tools at startup. The system
  prompt and a startup line surface the wallet/network/address.
