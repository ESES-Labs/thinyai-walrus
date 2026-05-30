import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { retry, timeout, rateLimit, toolCache, idempotency, runStructured } from "../index.js";
import type { ToolCallCtx } from "@thiny/core";

/* eslint-disable @typescript-eslint/consistent-type-assertions */
const fakeCall = (name: string, args: unknown = {}): ToolCallCtx => ({
  tool: { name } as ToolCallCtx["tool"],
  args,
  ctx: {} as ToolCallCtx["ctx"],
});
/* eslint-enable @typescript-eslint/consistent-type-assertions */

describe("retry", () => {
  it("retries a failing call and succeeds on the Nth attempt", async () => {
    let attempts = 0;
    const mw = retry({ retries: 2, baseDelayMs: 0 });
    const next = vi.fn(async () => {
      attempts++;
      if (attempts < 3) throw new Error("fail");
      return "ok";
    });
    expect(await mw(fakeCall("t"), next)).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("throws after exhausting all retries", async () => {
    const mw = retry({ retries: 1, baseDelayMs: 0 });
    const next = vi.fn(async () => {
      throw new Error("always fails");
    });
    await expect(mw(fakeCall("t"), next)).rejects.toThrow("always fails");
    expect(next).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
  });
});

describe("timeout", () => {
  it("rejects a call that exceeds the time limit", async () => {
    // Use real timers with very short durations to avoid fake-timer cleanup issues.
    const mw = timeout(20); // 20ms timeout
    const next = vi.fn(
      () =>
        new Promise<string>((r) =>
          setTimeout(() => {
            r("late");
          }, 200),
        ), // 200ms — much longer
    );
    await expect(mw(fakeCall("t"), next)).rejects.toThrow(/timeout/i);
  });
});

describe("rateLimit", () => {
  it("allows calls up to the limit then throws", async () => {
    const mw = rateLimit({ perMinute: 2 });
    const next = vi.fn(async () => "ok");
    await mw(fakeCall("t"), next);
    await mw(fakeCall("t"), next);
    await expect(mw(fakeCall("t"), next)).rejects.toThrow(/rate limit/i);
    expect(next).toHaveBeenCalledTimes(2);
  });
});

describe("toolCache", () => {
  it("returns the cached result without re-running the tool", async () => {
    const mw = toolCache();
    const next = vi.fn(async () => "computed");
    await mw(fakeCall("t", { a: 1 }), next);
    const second = await mw(fakeCall("t", { a: 1 }), next);
    expect(second).toBe("computed");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("runs again for different args", async () => {
    const mw = toolCache();
    const next = vi.fn(async (call: ToolCallCtx) => JSON.stringify(call.args));
    await mw(fakeCall("t", { a: 1 }), next);
    await mw(fakeCall("t", { a: 2 }), next);
    expect(next).toHaveBeenCalledTimes(2);
  });
});

describe("idempotency", () => {
  it("returns the same result for the same idempotency key", async () => {
    const mw = idempotency();
    let n = 0;
    const next = vi.fn(async () => {
      n++;
      return n;
    });
    const a = await mw(fakeCall("t", { idempotencyKey: "k1" }), next);
    const b = await mw(fakeCall("t", { idempotencyKey: "k1" }), next);
    expect(a).toBe(b);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe("runStructured", () => {
  it("parses and validates the final JSON answer", async () => {
    const schema = z.object({ score: z.number(), verdict: z.string() });
    /* eslint-disable @typescript-eslint/consistent-type-assertions */
    const fakeAgent = {
      run: async () => '{"score": 9, "verdict": "good"}',
      registry: {} as never,
      events: {} as never,
    };
    /* eslint-enable @typescript-eslint/consistent-type-assertions */
    const out = await runStructured(fakeAgent, "rate this", schema);
    expect(out).toEqual({ score: 9, verdict: "good" });
  });

  it("throws when the answer does not match the schema", async () => {
    const schema = z.object({ score: z.number() });
    /* eslint-disable @typescript-eslint/consistent-type-assertions */
    const fakeAgent = {
      run: async () => '{"name": "wrong"}',
      registry: {} as never,
      events: {} as never,
    };
    /* eslint-enable @typescript-eslint/consistent-type-assertions */
    await expect(runStructured(fakeAgent, "x", schema)).rejects.toThrow();
  });
});
