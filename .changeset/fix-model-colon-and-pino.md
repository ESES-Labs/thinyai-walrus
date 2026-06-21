---
"@thiny/model-aisdk": patch
"@thiny/logger-pino": patch
"thinyai": patch
---

Two install-affecting fixes:

- **Model ids with colons** (Ollama-style tags like `gpt-oss:120b`, `llama3:8b`) were misread as a
  `provider:id` and threw `unknown provider`. The resolver now only treats the text before the first
  colon as a provider when it's a recognised one (`openai`, `openai-compat`, `anthropic`); anything
  else — including ids that contain colons — is a bare model id, auto-detected from the base URL.
- **Logger crash on exit** — the file logger used an async sonic-boom destination, which threw
  `sonic boom is not ready yet` when the process exited quickly (e.g. on an error, on Node 25 / Bun
  global installs). The file sink is now synchronous so it always flushes cleanly on exit.
