---
"@thiny/signer-sui": minor
"@thiny/walrus": minor
---

C4 — on-chain memory-head pointer (verifiable + portable, replacing local JSON):

- New `@thiny/signer-sui`: `suiMemoryHead({ packageId, objectId, secretKey? })` with public `read()`
  and owner-gated `update()` over the `memory_head` Move object (in `move/memory_head`).
- `@thiny/walrus`: add `moveObjectPointerStore(head)` — a `PointerStore` backed by the on-chain
  memory-head, so `walrusMemory`'s transcript pointer lives on Sui instead of a local file. The
  walrus-demo head uses it automatically when `SUI_*` env is set.
