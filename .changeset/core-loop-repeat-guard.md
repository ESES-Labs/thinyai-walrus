---
"@thiny/core": minor
"thinyai": patch
---

Add a repeat guard to the ReAct loop: if the model requests the identical tool call(s) several times
in a row (3), the loop stops gracefully with a short note instead of spinning to `maxSteps`. This
bounds the worst case for weaker models that get stuck repeating a tool — the turn always ends quickly
and cheaply. The absolute `maxSteps` cap still applies to genuinely varying loops.
