# @thiny/signer-sui

> Sui client for the on-chain **memory-head** pointer — verifiable, ownable agent memory on Walrus.

## Install

```bash
pnpm add @thiny/signer-sui @mysten/sui
```

## Usage

```ts
import { suiMemoryHead } from "@thiny/signer-sui";

const head = suiMemoryHead({
  packageId: process.env.SUI_PACKAGE_ID!, // published memory_head package
  objectId: process.env.SUI_MEMORY_HEAD_ID!, // the shared MemoryHead object
  secretKey: process.env.SUI_SECRET_KEY, // suiprivkey… (omit for read-only)
});

await head.read(); // public — { transcript, audit, owner, updatedAtMs }
await head.update({ transcript: blobId }); // owner-gated → tx digest
```

Pair with `moveObjectPointerStore` (`@thiny/walrus`) to use this as the on-chain pointer for
`walrusMemory`, replacing a local `pointer.json`.

## One-time setup

The Move module is in [`move/memory_head`](../../../move/memory_head):

```bash
cd move/memory_head && sui move build
sui client publish --gas-budget 100000000          # → note the packageId
sui client call --package <packageId> --module memory_head --function create --gas-budget 10000000
# → note the created shared MemoryHead object id
```

## Public API

| Export                 | Description                                                            |
| ---------------------- | ---------------------------------------------------------------------- |
| `suiMemoryHead(opts)`  | `{ read(), update(pointers), address }` over the on-chain object       |
| `SuiMemoryHeadOptions` | `packageId`, `objectId`, `rpcUrl?`, `secretKey?`, `client?`, `signer?` |
| `MemoryHeadPointers`   | `{ transcript, audit, owner, updatedAtMs }`                            |

Reads need no key; `update` requires `secretKey` (or an injected `signer`) and must be the owner.
