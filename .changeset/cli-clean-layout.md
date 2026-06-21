---
"thinyai": patch
---

Clean up the chat layout. The user's message is no longer rendered twice (the `You › …` prompt echo
was being duplicated by a separate block), the full-width separator rules under every turn label are
gone, and Walrus storage confirmations collapse to a single compact, verifiable line
(`✓ memory saved on Walrus · <walruscan link>`) instead of three. Result is a tighter,
opencode/Claude-Code-style transcript.
