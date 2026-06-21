import { describe, it, expect } from "vitest";
import { type LanguageModel, simulateReadableStream } from "ai";
import { MockLanguageModelV1 } from "ai/test";
import { aiSdkModel } from "../index.js";

describe("aiSdkModel — model string resolution", () => {
  // ── Pre-built instance ────────────────────────────────────────────────────
  it("accepts a pre-built LanguageModel instance without resolving", () => {
    const fakeModel = {} as unknown as LanguageModel;
    expect(() => aiSdkModel({ model: fakeModel })).not.toThrow();
  });

  // ── Explicit prefixes ─────────────────────────────────────────────────────
  it("resolves openai:model-id with default settings", () => {
    expect(() => aiSdkModel({ model: "openai:gpt-4o-mini" })).not.toThrow();
  });

  it("resolves openai:model-id with a custom baseURL", () => {
    expect(() =>
      aiSdkModel({ model: "openai:llama3", openai: { baseURL: "http://localhost:11434/v1" } }),
    ).not.toThrow();
  });

  it("resolves openai-compat:model-id with a custom baseURL", () => {
    expect(() =>
      aiSdkModel({
        model: "openai-compat:mixtral-8x7b",
        openai: { baseURL: "https://api.together.xyz/v1", apiKey: "test-key" },
      }),
    ).not.toThrow();
  });

  it("resolves anthropic:model-id with default settings", () => {
    expect(() => aiSdkModel({ model: "anthropic:claude-haiku-4-5-20251001" })).not.toThrow();
  });

  it("resolves anthropic:model-id with a custom baseURL", () => {
    expect(() =>
      aiSdkModel({
        model: "anthropic:claude-3-5-haiku-20241022",
        anthropic: { baseURL: "https://my-proxy.example.com", apiKey: "proxy-key" },
      }),
    ).not.toThrow();
  });

  it("treats an unrecognised prefix as a bare model id (no throw)", () => {
    // "groq:llama3" is not a known provider → whole string is the model id (sent to the endpoint).
    expect(() => aiSdkModel({ model: "groq:llama3" })).not.toThrow();
  });

  it("keeps colons inside bare model ids (Ollama-style tags)", () => {
    // Regression: "gpt-oss:120b" must NOT be split into provider "gpt-oss" + id "120b".
    expect(() =>
      aiSdkModel({
        model: "gpt-oss:120b",
        openai: { baseURL: "http://localhost:11434/v1", apiKey: "ollama" },
      }),
    ).not.toThrow();
    expect(() => aiSdkModel({ model: "llama3:8b" })).not.toThrow();
  });

  // ── Bare model ID (no prefix) — auto-detect from base URL ─────────────────
  it("resolves a bare model ID as OpenAI when no base URL is set", () => {
    // No prefix, no base URL → falls back to standard OpenAI
    expect(() => aiSdkModel({ model: "gpt-4o-mini" })).not.toThrow();
  });

  it("resolves a bare model ID as OpenAI-compatible when openai.baseURL is set", () => {
    // The Mimo use case: just set the model name + base URL
    expect(() =>
      aiSdkModel({
        model: "mimo-v2.5-pro",
        openai: {
          baseURL: "https://token-plan-sgp.xiaomimimo.com/v1",
          apiKey: "your-mimo-key",
        },
      }),
    ).not.toThrow();
  });

  it("resolves a bare model ID as Ollama (OpenAI-compat) when openai.baseURL is set", () => {
    expect(() =>
      aiSdkModel({
        model: "llama3",
        openai: { baseURL: "http://localhost:11434/v1", apiKey: "ollama" },
      }),
    ).not.toThrow();
  });

  it("resolves a bare model ID as Groq (OpenAI-compat) when openai.baseURL is set", () => {
    expect(() =>
      aiSdkModel({
        model: "llama-3.1-70b-versatile",
        openai: { baseURL: "https://api.groq.com/openai/v1", apiKey: "gsk_test" },
      }),
    ).not.toThrow();
  });

  it("resolves a bare model ID as Anthropic-compatible when anthropic.baseURL is set", () => {
    expect(() =>
      aiSdkModel({
        model: "my-custom-model",
        anthropic: { baseURL: "https://my-anthropic-proxy.com", apiKey: "key" },
      }),
    ).not.toThrow();
  });

  it("prefers anthropic when anthropic.baseURL is set over openai fallback", () => {
    // When anthropic.baseURL is set, bare model ID should use anthropic even
    // if openai is also partially configured.
    expect(() =>
      aiSdkModel({
        model: "some-model",
        anthropic: { baseURL: "https://my-proxy.example.com" },
      }),
    ).not.toThrow();
  });
});

describe("aiSdkModel — stream() error handling", () => {
  // Regression: a streaming API error (bad model, bad key, rate limit) arrives as an `error`
  // part on fullStream rather than rejecting. It must surface as a throw, not an empty response.
  it("throws when the stream emits an error part", async () => {
    const model = new MockLanguageModelV1({
      doStream: () =>
        Promise.resolve({
          stream: simulateReadableStream({
            chunks: [
              { type: "error", error: new Error("model not found") },
              { type: "finish", finishReason: "error", usage: { promptTokens: 0, completionTokens: 0 } },
            ],
          }),
          rawCall: { rawPrompt: null, rawSettings: {} },
        }),
    });
    const provider = aiSdkModel({ model });
    await expect(
      (async () => {
        for await (const _part of provider.stream([{ role: "user", content: "hi" }], [])) {
          void _part; // drain
        }
      })(),
    ).rejects.toThrow(/model not found/);
  });
});
