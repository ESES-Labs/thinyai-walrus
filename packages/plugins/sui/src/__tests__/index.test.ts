import { describe, it, expect } from "vitest";
import { Transaction } from "@mysten/sui/transactions";
import { suiSigner } from "@thiny/signer-sui";
import { suiPlugin, type SuiPluginOptions } from "../index.js";
import type { Tool } from "@thiny/core";

// Live tests hit the real Sui testnet RPC (reads + devInspect — no key, no gas).
// Run with: SUI_LIVE_TESTS=1 pnpm vitest run packages/plugins/sui
const LIVE = process.env.SUI_LIVE_TESTS === "1";

function tool(opts: SuiPluginOptions, name: string): Tool {
  const t = suiPlugin(opts).tools?.find((x) => x.name === name);
  if (!t) throw new Error(`missing tool ${name}`);
  return t;
}

/** A real keyless signer (read-only) + a real keyed signer for the sign path. */
const keyless = () => suiSigner({ network: "testnet" });

describe("suiPlugin", () => {
  it("exposes sui_balance, sui_object, sui_execute_ptb", () => {
    const names = suiPlugin({ signer: keyless() }).tools?.map((t) => t.name);
    expect(names).toEqual(["sui_balance", "sui_object", "sui_execute_ptb"]);
  });

  it("sui_balance errors when there is no address and no key", async () => {
    await expect(tool({ signer: keyless() }, "sui_balance").execute({}, {} as never)).rejects.toThrow(
      /no address/,
    );
  });

  it("sui_execute_ptb rejects an unparseable PTB", async () => {
    await expect(
      tool({ signer: keyless() }, "sui_execute_ptb").execute(
        { unsignedTx: "@@@ not a ptb @@@" },
        {} as never,
      ),
    ).rejects.toThrow();
  });
});

describe.skipIf(!LIVE)("suiPlugin — live testnet", () => {
  it("sui_balance reads a real balance", async () => {
    const out = (await tool({ signer: keyless() }, "sui_balance").execute(
      { address: `0x${"0".repeat(63)}2` },
      {} as never,
    )) as { totalBalanceMist: string };
    expect(typeof out.totalBalanceMist).toBe("string");
  });

  it("sui_object reads the on-chain Clock (0x6)", async () => {
    const out = (await tool({ signer: keyless() }, "sui_object").execute(
      { objectId: "0x6" },
      {} as never,
    )) as { type?: string };
    expect(out.type).toContain("clock::Clock");
  });

  it("sui_execute_ptb re-simulates for real, then stops at signing (no key)", async () => {
    const tx = new Transaction();
    tx.splitCoins(tx.gas, [tx.pure.u64(1)]);
    const ptb = await tx.toJSON(); // Transaction.from() accepts this (or base64 BCS from a builder)
    // Sim passes against live testnet, policy passes, no approver → fails only at the sign step.
    await expect(
      tool({ signer: keyless() }, "sui_execute_ptb").execute({ unsignedTx: ptb }, {} as never),
    ).rejects.toThrow(/no key/);
  });

  it("sui_execute_ptb enforces the soft gas-budget policy after a real sim", async () => {
    const tx = new Transaction();
    tx.splitCoins(tx.gas, [tx.pure.u64(1)]);
    const ptb = await tx.toJSON();
    await expect(
      tool({ signer: keyless(), policy: { maxGasBudgetMist: 1n } }, "sui_execute_ptb").execute(
        { unsignedTx: ptb },
        {} as never,
      ),
    ).rejects.toThrow(/exceeds policy cap/);
  });

  it("sui_execute_ptb honors the approval gate after a real sim", async () => {
    const tx = new Transaction();
    tx.splitCoins(tx.gas, [tx.pure.u64(1)]);
    const ptb = await tx.toJSON();
    await expect(
      tool({ signer: keyless(), approver: () => Promise.resolve(false) }, "sui_execute_ptb").execute(
        { unsignedTx: ptb },
        {} as never,
      ),
    ).rejects.toThrow(/rejected by approver/);
  });

  it("sui_execute_ptb blocks a PTB that fails simulation (requireSimSuccess)", async () => {
    const tx = new Transaction();
    // A call into a non-existent package → the dry-run does not predict success.
    tx.moveCall({ target: `0x${"0".repeat(63)}9::nope::nope` });
    const ptb = await tx.toJSON();
    await expect(
      tool({ signer: keyless() }, "sui_execute_ptb").execute({ unsignedTx: ptb }, {} as never),
    ).rejects.toThrow();
  });
});
