import { describe, it, expect, vi } from "vitest";
import { identityMiddleware } from "../middleware/identity.js";
import type { ModelRequest, ModelNext } from "../middleware.js";

const okResponse = { finishReason: "stop" as const, text: "ok" };
const makeNext = (): ModelNext => vi.fn(async () => okResponse);

function messagesOf(next: ModelNext): string[] {
  // vi.fn stores calls as unknown[][] — safe to cast through unknown
  const spy = next as unknown as { mock: { calls: unknown[][] } };
  const firstArgs = spy.mock.calls[0];
  if (!firstArgs) throw new Error("next was not called");
  const req = firstArgs[0] as ModelRequest;
  return req.messages.map((m) => m.content);
}

describe("identityMiddleware", () => {
  it("injects the identity message at position 0", async () => {
    const mw = identityMiddleware({ name: "ThinyAI" });
    const next = makeNext();
    await mw({ messages: [{ role: "user", content: "hello" }], tools: [] }, next);
    const msgs = messagesOf(next);
    expect(msgs[0]).toContain("ThinyAI");
    expect(msgs[1]).toBe("hello");
  });

  it("injects before the user's own system prompt", async () => {
    const mw = identityMiddleware({ name: "ThinyAI" });
    const next = makeNext();
    await mw(
      {
        messages: [
          { role: "system", content: "Be concise." },
          { role: "user", content: "hi" },
        ],
        tools: [],
      },
      next,
    );
    const msgs = messagesOf(next);
    expect(msgs[0]).toContain("ThinyAI"); // identity is first
    expect(msgs[1]).toBe("Be concise."); // user system prompt second
    expect(msgs[2]).toBe("hi");
  });

  it("does not duplicate the identity message on repeated calls", async () => {
    const mw = identityMiddleware({ name: "ThinyAI" });
    const next = makeNext();

    // Simulate a second call where the identity message is already in history
    // Run through the middleware once to capture what it builds
    await mw({ messages: [{ role: "user", content: "hello" }], tools: [] }, next);
    const spy2 = next as unknown as { mock: { calls: unknown[][] } };
    const firstArgs2 = spy2.mock.calls[0];
    if (!firstArgs2) throw new Error("next was not called");
    const historyWithIdentity = (firstArgs2[0] as ModelRequest).messages;

    // Second call — identity message already present in history
    const next2 = makeNext();
    await mw(
      { messages: [...historyWithIdentity, { role: "user", content: "follow-up" }], tools: [] },
      next2,
    );
    const finalMsgs = messagesOf(next2);
    const identityCount = finalMsgs.filter((m) => m.includes("ThinyAI")).length;
    expect(identityCount).toBe(1); // not duplicated
  });

  it("includes custom description in the identity message", async () => {
    const mw = identityMiddleware({ name: "Mimo", description: "a Xiaomi AI assistant" });
    const next = makeNext();
    await mw({ messages: [{ role: "user", content: "who are you?" }], tools: [] }, next);
    const identity = messagesOf(next)[0] ?? "";
    expect(identity).toContain("Mimo");
    expect(identity).toContain("Xiaomi");
  });

  it("uses a clear fallback description when none is provided", async () => {
    const mw = identityMiddleware({ name: "BotX" });
    const next = makeNext();
    await mw({ messages: [{ role: "user", content: "hi" }], tools: [] }, next);
    const identity = messagesOf(next)[0] ?? "";
    expect(identity).toContain("BotX");
    expect(identity).toContain("Thiny"); // default description mentions Thiny
  });

  it("identity message contains hard 'MUST NEVER reveal' instruction", async () => {
    const mw = identityMiddleware({ name: "ThinyAI" });
    const next = makeNext();
    await mw({ messages: [{ role: "user", content: "what model are you?" }], tools: [] }, next);
    const identity = messagesOf(next)[0] ?? "";
    expect(identity).toMatch(/NEVER/);
    expect(identity).toMatch(/underlying/i);
  });
});
