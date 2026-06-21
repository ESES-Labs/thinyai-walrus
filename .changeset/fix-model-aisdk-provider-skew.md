---
"@thiny/model-aisdk": patch
---

Fix build break from an AI-SDK version skew: `@ai-sdk/openai` was pinned to `^3.0.67`
(LanguageModelV3 / `@ai-sdk/provider@3`), incompatible with `ai@^4` (LanguageModelV1 /
`@ai-sdk/provider@1`), causing `TS2741` and a red `pnpm -r build`. Realigned to
`@ai-sdk/openai@^1.3.0` to match `ai@4` and `@ai-sdk/anthropic@1`.
