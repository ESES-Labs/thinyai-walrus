---
"@thiny/walrus": patch
---

Make `walrusMemoryPlugin` writes non-blocking so turns don't stall on a Walrus upload. The
in-memory cache updates synchronously (recall/context are immediately consistent) while the Walrus
PUT runs in the background, chained to avoid racing the pointer. The cache is also warmed at startup
so the first turn isn't blocked on a GET. A new `flush()` awaits any in-flight write — the CLI calls
it on exit for last-write durability.
