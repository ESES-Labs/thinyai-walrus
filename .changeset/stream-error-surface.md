---
"@thiny/model-aisdk": patch
---

Surface streaming API errors instead of swallowing them. The AI SDK reports failures (unknown
model, bad key, rate limit, network) as an `error` part on `fullStream` rather than rejecting —
the stream loop ignored it, so any such failure looked like an empty model response
(`(model returned empty response)` in the CLI). `stream()` now throws the underlying error so it
propagates to the caller and renders as a real error message.
