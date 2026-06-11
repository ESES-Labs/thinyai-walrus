import { describe, it, expect } from "vitest";
import { DEFAULT_REDACT_PATHS } from "../index.js";

describe("pinoLogger redaction", () => {
  it("has default redact paths covering critical Web3 secrets", () => {
    expect(DEFAULT_REDACT_PATHS).toContain("privateKey");
    expect(DEFAULT_REDACT_PATHS).toContain("AGENT_PRIVATE_KEY");
    expect(DEFAULT_REDACT_PATHS).toContain("authorization");
    expect(DEFAULT_REDACT_PATHS).toContain("apiKey");
    expect(DEFAULT_REDACT_PATHS).toContain("api_key");
    expect(DEFAULT_REDACT_PATHS).toContain("*.token");
    expect(DEFAULT_REDACT_PATHS).toContain("headers.authorization");
    expect(DEFAULT_REDACT_PATHS).toContain("headers[*].authorization");
  });

  it("redacts sensitive fields in structured log output", () => {
    const { Writable } = require("node:stream");
    const chunks: string[] = [];
    const testStream = new Writable({
      write(chunk: Buffer, _encoding: string, callback: () => void) {
        chunks.push(chunk.toString());
        callback();
      },
    });

    const pino = require("pino");
    const instance = pino(
      {
        level: "info",
        redact: {
          paths: DEFAULT_REDACT_PATHS,
          censor: "[REDACTED]",
        },
      },
      testStream,
    );

    // Log an object containing a secret
    instance.info({
      event: "test",
      privateKey: "0xabcdef1234567890",
      apiKey: "sk-very-secret-key",
      authorization: "Bearer token123",
      safeData: "this is visible",
    }, "test message");

    const output = chunks.join("");
    const parsed = JSON.parse(output);

    // Sensitive fields should be redacted
    expect(parsed.privateKey).toBe("[REDACTED]");
    expect(parsed.apiKey).toBe("[REDACTED]");
    expect(parsed.authorization).toBe("[REDACTED]");

    // Non-sensitive fields should remain visible
    expect(parsed.safeData).toBe("this is visible");
    expect(parsed.event).toBe("test");
  });

  it("redacts nested token fields while preserving safe fields", () => {
    const { Writable } = require("node:stream");
    const chunks: string[] = [];
    const testStream = new Writable({
      write(chunk: Buffer, _encoding: string, callback: () => void) {
        chunks.push(chunk.toString());
        callback();
      },
    });

    const pino = require("pino");
    const instance = pino(
      {
        level: "info",
        redact: {
          paths: DEFAULT_REDACT_PATHS,
          censor: "[REDACTED]",
        },
      },
      testStream,
    );

    instance.info({
      event: "tool_call",
      headers: {
        authorization: "Bearer abc123",
        "content-type": "application/json",
      },
    }, "tool call");

    const output = chunks.join("");
    const parsed = JSON.parse(output);

    expect(parsed.headers.authorization).toBe("[REDACTED]");
    expect(parsed.headers["content-type"]).toBe("application/json");
  });
});
