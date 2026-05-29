import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createAgent, defineTool } from "@thiny/core";
import { scriptModel, runEval } from "../index.js";

describe("scriptModel", () => {
  it("returns scripted responses in order then repeats the last step", async () => {
    const model = scriptModel([
      { finishReason: "stop", text: "first" },
      { finishReason: "stop", text: "second" },
    ]);
    const r1 = await model.generate([], []);
    const r2 = await model.generate([], []);
    const r3 = await model.generate([], []); // repeats last
    expect(r1.text).toBe("first");
    expect(r2.text).toBe("second");
    expect(r3.text).toBe("second");
  });

  it("throws when given an empty steps array", () => {
    expect(() => scriptModel([])).toThrow(/empty/i);
  });
});

describe("runEval", () => {
  it("passes when the expected tool was called and final text matches", async () => {
    const agent = await createAgent({
      model: scriptModel([
        {
          finishReason: "tool_calls",
          toolCalls: [{ id: "1", name: "echo", args: { text: "hi" } }],
        },
        { finishReason: "stop", text: "the echo result is: hi" },
      ]),
      tools: [
        defineTool({
          name: "echo",
          description: "",
          parameters: z.object({ text: z.string() }),
          execute: async ({ text }) => text,
        }),
      ],
    });

    const results = await runEval(agent, [
      {
        name: "echo-test",
        input: "echo hi",
        expectToolCalls: ["echo"],
        expectFinal: /echo result/,
      },
    ]);

    expect(results[0]?.passed).toBe(true);
    expect(results[0]?.reasons).toHaveLength(0);
  });

  it("fails and reports when an expected tool was not called", async () => {
    const agent = await createAgent({
      model: scriptModel([{ finishReason: "stop", text: "no tools used" }]),
    });

    const results = await runEval(agent, [
      { name: "missing-tool", input: "search something", expectToolCalls: ["web_search"] },
    ]);

    expect(results[0]?.passed).toBe(false);
    expect(results[0]?.reasons.join()).toMatch(/missing tool call: web_search/);
  });

  it("fails when the final text does not match the expectation", async () => {
    const agent = await createAgent({
      model: scriptModel([{ finishReason: "stop", text: "wrong answer" }]),
    });

    const results = await runEval(agent, [
      { name: "text-check", input: "x", expectFinal: /correct answer/ },
    ]);

    expect(results[0]?.passed).toBe(false);
    expect(results[0]?.reasons.join()).toMatch(/final text/i);
  });
});
