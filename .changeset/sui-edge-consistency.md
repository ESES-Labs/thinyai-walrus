---
"@thiny/plugin-sui": minor
"thinyai": patch
---

Make Sui tools consistent even with weaker models. When no wallet is set up, the Sui tools now
RETURN a clear "setup needed" result instead of THROWING — a thrown error made weak models retry the
tool in a loop (observed: a no-wallet balance query spun through all 12 ReAct steps). With a terminal
result the agent relays it once and asks the user to set up (network + wallet), in a single tool call.
Also: `sui_balances` includes the active signer's address even when it came from an env key (not the
config wallet list), so balances aren't missed. Verified live on testnet end-to-end.
