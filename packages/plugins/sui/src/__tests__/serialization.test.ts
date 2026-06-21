import { describe, it, expect } from "vitest";
import { Transaction } from "@mysten/sui/transactions";

/**
 * Pins the PTB wire contract shared with Rill: the builder serializes with `Transaction.toJSON()`
 * (no sender, no gas) and `plugin-sui` reconstructs with `Transaction.from(unsignedTx)`. If either
 * side drifts from this, execution breaks — this is the guard. Pure, deterministic, no network.
 */
describe("PTB wire contract — toJSON() ↔ Transaction.from()", () => {
  it("round-trips a builder-style PTB (no sender/gas) with commands preserved", async () => {
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(1)]);
    tx.transferObjects([coin], tx.pure.address(`0x${"0".repeat(64)}`));

    const unsignedTx = await tx.toJSON();
    expect(typeof unsignedTx).toBe("string");

    const restored = Transaction.from(unsignedTx);
    const data = restored.getData();

    // splitCoins + transferObjects survive the round-trip…
    expect(data.commands).toHaveLength(2);
    // …and the builder set NO sender (the signer fills it at sign time).
    expect(data.sender).toBeFalsy();
  });
});
