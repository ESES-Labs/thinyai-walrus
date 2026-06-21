---
"@thiny/walrus": minor
"@thiny/memory-memwal": minor
---

Split memory by purpose (submission plan §3):

- `@thiny/walrus`: add `walrusMemory` — a `MemoryBackend` that stores each transcript as a
  content-addressed Walrus blob and tracks `sessionId → blobId` via a new `PointerStore`
  (`inMemoryPointerStore` / `filePointerStore`). Exact + verifiable transcript persistence; the
  pointer can later move on-chain (memory-head). `putBlob` now returns a verifiable `WalrusBlobRef`.
- `@thiny/memory-memwal`: reposition MemWal to its real strength — semantic facts. Add
  `memwalFactsPlugin` (`remember_fact` / `recall_memory`) and `finalizeSessionToMemwal`. `memwalMemory`
  is kept as a caveated convenience; prefer `walrusMemory` for transcripts.
