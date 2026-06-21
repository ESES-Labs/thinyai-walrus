---
"thinyai": minor
---

Live slash-command palette (like Claude Code / opencode): type `/` and a dropdown of commands
(name + description) appears under the prompt, filters as you type, navigate with ↑/↓, Enter to run,
Tab to complete, Esc to dismiss. Built on a small raw-mode prompt (`SlashPrompt`) that owns the input
line; falls back gracefully on non-TTY input. Ctrl-D now exits cleanly.
