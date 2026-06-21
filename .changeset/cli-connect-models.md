---
"thinyai": minor
---

Provider/model switching + a slash-command menu:

- `/connect` — list configured LLM providers and switch the active one (live, no restart).
- `/models` — change the active provider's model (live).
- Typing `/` alone now lists every command, tool, and skill the CLI has.

Config now stores multiple `providers[]` + an `activeProviderId` (the legacy single-provider shape is
migrated transparently), and the model is held in a mutable wrapper so it can be swapped mid-session.
