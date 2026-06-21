---
"thinyai": patch
---

Add `thiny update` (alias `thiny upgrade`) — self-updates the global install to the latest published
version. It detects the package manager that installed it (bun / npm / pnpm) from the binary's path
and runs the right `add -g thinyai@latest` (or `install -g`), with a manual fallback printed if it
fails.
