import { describe, it, expect } from "vitest";
import { modelFromEnv } from "../env.js";

describe("modelFromEnv", () => {
  it("uses THINY_MODEL when set", () => {
    const model = modelFromEnv({ THINY_MODEL: "openai:gpt-4o" });
    expect(model).toBeDefined();
  });

  it("falls back to AGENT_MODEL", () => {
    const model = modelFromEnv({ AGENT_MODEL: "anthropic:claude-haiku-4-5-20251001" });
    expect(model).toBeDefined();
  });

  it("falls back to gpt-4o-mini when no env is set", () => {
    expect(() => modelFromEnv({})).not.toThrow();
  });

  it("picks up THINY_OPENAI_BASE_URL (custom OpenAI-compatible endpoint)", () => {
    expect(() =>
      modelFromEnv({
        THINY_MODEL: "openai-compat:llama3",
        THINY_OPENAI_BASE_URL: "http://localhost:11434/v1",
        THINY_OPENAI_API_KEY: "ollama",
      }),
    ).not.toThrow();
  });

  it("falls back to OPENAI_BASE_URL when THINY_ prefix is absent", () => {
    expect(() =>
      modelFromEnv({
        AGENT_MODEL: "openai-compat:mixtral",
        OPENAI_BASE_URL: "https://api.groq.com/openai/v1",
        OPENAI_API_KEY: "gsk_test",
      }),
    ).not.toThrow();
  });

  it("picks up THINY_ANTHROPIC_BASE_URL for a proxy", () => {
    expect(() =>
      modelFromEnv({
        THINY_MODEL: "anthropic:claude-3-5-haiku-20241022",
        THINY_ANTHROPIC_BASE_URL: "https://my-proxy.example.com",
        THINY_ANTHROPIC_API_KEY: "proxy-key",
      }),
    ).not.toThrow();
  });
});
