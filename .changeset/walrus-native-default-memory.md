---
"@thiny/walrus": minor
"@thiny/cli": minor
---

Make cross-session memory Walrus-native by default; remove the SQLite-based `@thiny/plugin-user-memory`.

- `@thiny/walrus`: add `walrusMemoryPlugin` — durable, portable cross-session memory on Walrus (no
  SQLite, no platform lock-in). Auto-injects known facts as a system message each turn and exposes
  `remember_fact` / `recall_memory`. Facts are a content-addressed Walrus blob tracked by a
  `PointerStore` (local file by default, on-chain memory-head for full portability). Resilient: a
  Walrus error degrades to "no memory this turn" rather than breaking the conversation.
- `@thiny/cli`: cross-session memory is now ON by default for every user via `walrusMemoryPlugin`
  (or `memwalFactsPlugin` when MemWal creds are set) — transcripts are ephemeral per session, durable
  facts live on Walrus. Removed the SQLite transcript/user-memory defaults.
- **Removed** `@thiny/plugin-user-memory` (replaced by the Walrus-native plugin above).
