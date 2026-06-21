# @thiny/plugin-sui

> Sui read tools + a **gated PTB executor** — grounded, capped agent transactions on Sui.

## Install

```bash
pnpm add @thiny/plugin-sui @thiny/signer-sui @mysten/sui
```

## Usage

```ts
import { suiSigner } from "@thiny/signer-sui";
import { suiPlugin } from "@thiny/plugin-sui";

const signer = suiSigner({
  network: "mainnet",
  secretKey: process.env.SUI_SECRET_KEY, // suiprivkey…
  allowMainnet: true, // mainnet guard — off by default
});

const agent = await createAgent({
  model,
  plugins: [
    mcpHttpPlugin({ url: rillMcpUrl }), // gets unsigned PTBs from Rill
    suiPlugin({ signer, policy: { maxGasBudgetMist: 50_000_000n }, approver }),
  ],
});
```

## Tools

| Tool | Input | Does |
|------|-------|------|
| `sui_balance` | `{ address?, coinType? }` | Read a coin balance (defaults to the agent's address + SUI). |
| `sui_object` | `{ objectId }` | Read an object's type + fields. |
| `sui_execute_ptb` | `{ ptbBase64 }` | **Gated executor:** deserialize → re-`devInspect` → soft policy → approval gate → sign → submit. |

## The gated path (`sui_execute_ptb`)

The agent receives an **unsigned PTB** from a builder (e.g. Rill's hosted MCP, which returns
`{ unsignedPtb, preview, simulation }`) and hands it here. The plugin:

1. Deserializes the PTB (`Transaction.from`).
2. **Re-simulates** (`devInspect`) — aborts if it would fail (defense-in-depth; no gas, no signature).
3. Applies the **soft policy** (`requireSimSuccess`, `maxGasBudgetMist`).
4. Calls the optional **approver** (human or headless).
5. **Signs + submits** via `@thiny/signer-sui` (mainnet guard inside).

**Protocol-agnostic:** it signs whatever bytes it's given — no Cetus/DeepBook SDKs. **Hard** budget /
scope / expiry caps are enforced **on-chain** by the `agent_wallet` Move object baked into the PTB; an
over-cap/expired/revoked tx aborts on-chain and surfaces as a tool observation. This TS policy is the
soft/UX layer, never the source of truth for money safety.

## Public API

| Export | Description |
|--------|-------------|
| `suiPlugin(opts)` | The plugin factory |
| `SuiPluginOptions` | `signer`, `policy?`, `approver?` |
| `SuiExecPolicy` | `requireSimSuccess?`, `maxGasBudgetMist?` |
