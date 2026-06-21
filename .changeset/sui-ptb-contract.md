---
"@thiny/plugin-sui": patch
---

Lock the PTB wire contract for `sui_execute_ptb`: rename the tool param `ptbBase64` → `unsignedTx`
and document that the builder serializes the PTB with `Transaction.toJSON()` and sets **no sender and
no gas** (the signer fills both). This matches Rill's MCP return shape `{ unsignedTx, preview,
simulation }` and prevents the two repos from drifting on serialization.
