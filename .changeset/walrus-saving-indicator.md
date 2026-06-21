---
"@thiny/walrus": patch
"thinyai": patch
---

Show a non-blocking "saving…" indicator for background Walrus memory writes, and surface the
verifiable link whenever the write lands — even after the turn, printed above the prompt without
disturbing what the user is typing. `walrusMemoryPlugin` gains an `onStoreStart` hook (paired with
`onStore`) so the CLI can render the in-flight state. The user can keep chatting while a write
uploads.
