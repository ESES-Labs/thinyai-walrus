import { describe, it, expect } from "vitest";
import { denyApprover, autoApprover } from "../approvers.js";

describe("denyApprover", () => {
  it("always returns false (safe default for headless mode)", async () => {
    expect(await denyApprover({ tool: "send_eth", args: {}, reason: "test" })).toBe(false);
    expect(await denyApprover({ tool: "any", args: {}, reason: "" })).toBe(false);
  });
});

describe("autoApprover", () => {
  it("approves only allowlisted tools", async () => {
    const approver = autoApprover(["safe_tool", "read_only"]);
    expect(await approver({ tool: "safe_tool", args: {}, reason: "allowlisted" })).toBe(true);
    expect(await approver({ tool: "read_only", args: {}, reason: "allowlisted" })).toBe(true);
  });

  it("denies tools not in the allowlist", async () => {
    const approver = autoApprover(["read_only"]);
    expect(await approver({ tool: "send_eth", args: {}, reason: "not in list" })).toBe(false);
  });

  it("returns false for empty allowlist", async () => {
    const approver = autoApprover([]);
    expect(await approver({ tool: "any", args: {}, reason: "" })).toBe(false);
  });
});
