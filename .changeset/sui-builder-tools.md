---
"@thiny/plugin-sui": minor
"thinyai": minor
---

Let the agent build and run transactions itself, not just sign externally-built ones. Adds two
builder tools that compose a PTB locally and run it through the same gated path (simulate → policy →
approve → sign → submit):

- **`sui_transfer`** — send SUI or any coin to an address (amounts in MIST).
- **`sui_move_call`** — call ANY Move function on any package (the general way to run any on-chain
  action: swaps, mints, staking, arbitrary contracts).

With these, a local agent wallet can transact end-to-end without an external builder like Rill;
`sui_execute_ptb` remains for signing PTBs a builder produced.
