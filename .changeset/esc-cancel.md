---
"@thiny/core": minor
"@thiny/model-aisdk": minor
"thinyai": minor
---

Support cancelling an in-flight turn. `agent.run` now accepts an optional `AbortSignal` (`opts.signal`),
threaded through `ModelProvider.generate`/`stream` (new optional `signal` arg) to the AI SDK's
`abortSignal`. The CLI wires this to **Esc** — press it while the agent is thinking to abort the model
request and return to the prompt (nothing is persisted for the cancelled turn).
