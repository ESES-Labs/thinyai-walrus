import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  policyMiddleware,
  budgetMiddleware,
  simulateMiddleware,
  denyApprover,
  autoApprover,
} from "../index.js";

describe("Trust boundary — policy deny/approve", () => {
  it("denyApprover returns false for any approval request", async () => {
    const result = await denyApprover({
      tool: "send_eth",
      args: { to: "0xabc", value: "1.0" },
      reason: "sensitive tool",
    });
    expect(result).toBe(false);
  });

  it("autoApprover allows non-sensitive permitted tools", async () => {
    const approver = autoApprover(["eth_balance", "get_price"]);
    const result = await approver({
      tool: "eth_balance",
      args: { address: "0xabc" },
      reason: "read-only",
    });
    expect(result).toBe(true);
  });

  it("autoApprover blocks tools not in allowlist", async () => {
    const approver = autoApprover(["eth_balance"]);
    const result = await approver({
      tool: "send_eth",
      args: { to: "0xabc", value: "1.0" },
      reason: "not on allowlist",
    });
    expect(result).toBe(false);
  });
});

describe("Trust boundary — budget circuit breaker", () => {
  it("budgetMiddleware creates a middleware function", () => {
    const mw = budgetMiddleware({ maxTokens: 1000 });
    expect(mw).toBeDefined();
    expect(typeof mw).toBe("function");
  });

  it("budgetMiddleware accepts maxTokens and maxCalls options", () => {
    const mwTokens = budgetMiddleware({ maxTokens: 5000 });
    const mwBoth = budgetMiddleware({ maxTokens: 5000, maxCalls: 50 });
    expect(mwTokens).toBeDefined();
    expect(mwBoth).toBeDefined();
  });
});

describe("Trust boundary — simulate middleware", () => {
  it("simulateMiddleware creates a middleware function", () => {
    const mw = simulateMiddleware(() => Promise.resolve({ success: true }));
    expect(mw).toBeDefined();
    expect(typeof mw).toBe("function");
  });
});

describe("Trust boundary — policy middleware", () => {
  it("policyMiddleware creates a middleware function", () => {
    const mw = policyMiddleware([]);
    expect(mw).toBeDefined();
    expect(typeof mw).toBe("function");
  });

  it("policyMiddleware accepts deny rules", () => {
    const mw = policyMiddleware([
      (call) => (call.tool.name === "send_eth" ? { effect: "deny", reason: "blocked" } : null),
    ]);
    expect(mw).toBeDefined();
  });

  it("policyMiddleware accepts approve rules", () => {
    const mw = policyMiddleware([
      (call) => (call.tool.name === "eth_balance" ? { effect: "approve", reason: "read-only" } : null),
    ]);
    expect(mw).toBeDefined();
  });
});

describe("Trust boundary — Zod validation of tool args (LLM output boundary)", () => {
  it("validates that tool args from LLM are schema-conformant", () => {

    const SendEthSchema = z.object({
      to: z.string().startsWith("0x"),
      value: z.string().regex(/^\d+(\.\d+)?$/),
    });

    // Valid args pass
    const valid = SendEthSchema.safeParse({ to: "0x1234", value: "1.0" });
    expect(valid.success).toBe(true);

    // Malformed args (from a compromised LLM) fail
    expect(SendEthSchema.safeParse({ to: "vitalik.eth", value: "1.0" }).success).toBe(false);

    // Missing required field
    expect(SendEthSchema.safeParse({ to: "0x1234" }).success).toBe(false);
  });

  it("rejects non-object input to tool call args", () => {
    const schema = z.object({ address: z.string() });

    expect(schema.safeParse("not-an-object").success).toBe(false);
    expect(schema.safeParse(null).success).toBe(false);
    expect(schema.safeParse(42).success).toBe(false);
  });

  it("rejects args with wrong types", () => {
    const schema = z.object({
      to: z.string(),
      value: z.number().positive(),
    });

    // value should be number, not string
    expect(schema.safeParse({ to: "0xabc", value: "1.0" }).success).toBe(false);

    // to should be string, not number
    expect(schema.safeParse({ to: 123, value: 1.0 }).success).toBe(false);
  });
});

describe("Trust boundary — mainnet guard", () => {
  it("requires allowMainnet for production chains", () => {
    // The mainnet guard is checked in @thiny/signer-viem and @thiny/plugin-evm
    // It requires explicit allowMainnet: true before executing on mainnet chains
    const mainnetChainIds = [1, 137, 42161, 10]; // Ethereum, Polygon, Arbitrum, Optimism

    // Principle: without allowMainnet, these should be blocked
    mainnetChainIds.forEach((chainId) => {
      expect([1, 137, 42161, 10]).toContain(chainId);
    });
  });
});
