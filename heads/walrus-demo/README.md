# @thiny/walrus-demo

> The hero demo: an autonomous monitoring agent with **verifiable, portable** memory on Walrus.

Not a chatbot. On each tick the agent:

1. **Recalls** prior context from Walrus (transcript via `walrusMemory`; optional semantic facts via MemWal).
2. **Observes** live Sui testnet state (`check_sui_status`, public RPC, no key).
3. **Decides** and notes whether the network advanced since last tick.
4. **Persists** three things to Walrus, each printed with a Walruscan/Suiscan link:
   - the **transcript** (memory) — content-addressed blob + pointer,
   - the **audit trail** (every model + tool call) — the tamper-evident "black-box recorder",
   - a **report artifact**.

Because memory lives on Walrus (not local disk), the agent resumes across restarts — and, once the
pointer is on-chain (C4), across machines.

## Run

```bash
pnpm walrus-demo                      # tick every 60s
TICK_MS=15000 MAX_RUNS=5 pnpm walrus-demo
```

Requires a model key (`THINY_MODEL` + provider key). Set `MEMWAL_*` to enable the semantic facts
layer. Verify any printed audit blob independently with `thiny` → `/verify <blobId>`.

## Env

| Var | Meaning |
|-----|---------|
| `TICK_MS` | Interval between ticks (default 60000) |
| `MAX_RUNS` | Stop after N ticks (default: unlimited) |
| `WALRUS_NETWORK` | `testnet` (default) / `mainnet` — drives explorer URLs |
| `WALRUS_POINTERS` | Pointer file path (default `thiny-pointers.json`) |
| `MEMWAL_DELEGATE_KEY` / `MEMWAL_ACCOUNT_ID` | Enable semantic facts (optional) |
