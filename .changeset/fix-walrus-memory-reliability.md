---
"@thiny/walrus": minor
"thinyai": patch
---

Fix cross-session memory reliability. The Walrus testnet PUT takes ~10s, so a remembered fact wasn't
durable until then — and an immediate exit/Ctrl-C lost it, making memory look broken and recall come
back empty. `walrusMemoryPlugin` now takes a `cacheFile` that mirrors the facts to a local JSON file
**synchronously** on every change, so memory is instant and reliable across sessions regardless of
Walrus speed/uptime; Walrus remains the verifiable, portable copy (and still surfaces the blob link).
`load()` reads the local cache first. The CLI writes `~/.thiny/memory-<userId>.json`, and the prompt
now tells the agent its facts are auto-injected so it stops needlessly calling `recall_memory`.
