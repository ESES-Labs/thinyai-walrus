import type { Agent, ModelProvider, ModelResponse } from "@thiny/core";

/**
 * A deterministic `ModelProvider` that returns scripted responses in order.
 *
 * When the script is exhausted, the last step is repeated indefinitely.
 * Designed for use in `runEval` scenarios — fully offline, no API calls.
 *
 * @throws {Error} When `steps` is empty.
 *
 * @example
 * ```ts
 * const model = scriptModel([
 *   { finishReason: "tool_calls", toolCalls: [{ id: "1", name: "search", args: { q: "x" } }] },
 *   { finishReason: "stop", text: "The answer is 42." },
 * ]);
 * ```
 */
export function scriptModel(steps: ModelResponse[]): ModelProvider {
  if (steps.length === 0) {
    throw new Error("scriptModel: steps array must not be empty");
  }
  let index = 0;
  return {
    generate: (): Promise<ModelResponse> =>
      // steps[idx] is always defined: idx is clamped to [0, steps.length-1]
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      Promise.resolve(steps[Math.min(index++, steps.length - 1)]!),
  };
}

/** A single scenario to evaluate against an agent. */
export interface Scenario {
  /** Unique identifier shown in failure messages. */
  name: string;
  /** Input passed to `agent.run()`. */
  input: string;
  /** Tool names that MUST be called during the run. */
  expectToolCalls?: string[];
  /** Substring or RegExp the final answer must match. */
  expectFinal?: string | RegExp;
  /** Session ID to use for this scenario. Defaults to `eval:<name>`. */
  sessionId?: string;
}

/** Result of evaluating one scenario. */
export interface EvalResult {
  name: string;
  passed: boolean;
  reasons: string[];
  final: string;
  toolCalls: string[];
}

/**
 * Run a set of scripted scenarios against an agent and assert their outcomes.
 *
 * All scenarios run sequentially. Each gets its own session ID so they don't
 * share conversation history. No network calls are made — pair with
 * `scriptModel` for fully deterministic, offline testing.
 *
 * @example
 * ```ts
 * const results = await runEval(agent, [
 *   { name: "greeting", input: "hello", expectFinal: /hello/i },
 * ]);
 * expect(results.every((r) => r.passed)).toBe(true);
 * ```
 */
export async function runEval(agent: Agent, scenarios: Scenario[]): Promise<EvalResult[]> {
  const results: EvalResult[] = [];

  for (const scenario of scenarios) {
    const observedToolCalls: string[] = [];

    const toolCallHandler = (payload: unknown): void => {
      const { call } = payload as { call: { name: string } };
      observedToolCalls.push(call.name);
    };
    agent.events.on("beforeToolCall", toolCallHandler);

    const reasons: string[] = [];
    let finalText = "";

    try {
      finalText = await agent.run(scenario.input, {
        sessionId: scenario.sessionId ?? `eval:${scenario.name}`,
      });
    } catch (err) {
      reasons.push(`threw: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      agent.events.off("beforeToolCall", toolCallHandler);
    }

    for (const expectedTool of scenario.expectToolCalls ?? []) {
      if (!observedToolCalls.includes(expectedTool)) {
        reasons.push(`missing tool call: ${expectedTool}`);
      }
    }

    if (scenario.expectFinal !== undefined) {
      const matched =
        typeof scenario.expectFinal === "string"
          ? finalText.includes(scenario.expectFinal)
          : scenario.expectFinal.test(finalText);
      if (!matched) {
        reasons.push(`final text "${finalText.slice(0, 80)}" did not match expectation`);
      }
    }

    results.push({
      name: scenario.name,
      passed: reasons.length === 0,
      reasons,
      final: finalText,
      toolCalls: observedToolCalls,
    });
  }

  return results;
}
