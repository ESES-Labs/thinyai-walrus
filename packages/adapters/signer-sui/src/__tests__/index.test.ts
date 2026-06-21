import { describe, it, expect } from "vitest";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { suiSigner, suiMemoryHead } from "../index.js";

// Live tests hit the real Sui testnet RPC (no key, no gas — reads + devInspect only).
// Run them with: SUI_LIVE_TESTS=1 pnpm vitest run packages/adapters/signer-sui
const LIVE = process.env.SUI_LIVE_TESTS === "1";

describe("suiSigner", () => {
  it("has no address and refuses to sign without a key", async () => {
    const s = suiSigner({ network: "testnet" });
    expect(s.hasKey()).toBe(false);
    expect(s.address).toBeUndefined();
    await expect(s.signAndExecute(new Transaction())).rejects.toThrow(/no key configured/);
  });

  it("derives a real address from a generated keypair", () => {
    const s = suiSigner({ network: "testnet", signer: Ed25519Keypair.generate() });
    expect(s.hasKey()).toBe(true);
    expect(s.address).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("enforces the mainnet guard (off by default)", async () => {
    const s = suiSigner({ network: "mainnet", signer: Ed25519Keypair.generate() });
    expect(s.network).toBe("mainnet");
    await expect(s.signAndExecute(new Transaction())).rejects.toThrow(/mainnet/);
  });

  it("allows mainnet when explicitly opted in (reaches signing, not the guard)", async () => {
    // With allowMainnet, the guard is passed; signing then fails for a different reason
    // (an unfunded generated key) — proving the guard no longer blocks.
    const s = suiSigner({ network: "mainnet", signer: Ed25519Keypair.generate(), allowMainnet: true });
    await expect(s.signAndExecute(new Transaction())).rejects.not.toThrow(/refusing to sign on mainnet/);
  });
});

describe.skipIf(!LIVE)("suiSigner — live testnet", () => {
  it("devInspect dry-runs a PTB with no key", async () => {
    const s = suiSigner({ network: "testnet" });
    const tx = new Transaction();
    tx.splitCoins(tx.gas, [tx.pure.u64(1)]);
    const res = await s.devInspect(tx);
    expect(res.effects.status.status).toBe("success");
  });

  it("reads on-chain state from the live RPC", async () => {
    const s = suiSigner({ network: "testnet" });
    const bal = await s.client.getBalance({ owner: `0x${"0".repeat(63)}2` });
    expect(typeof bal.totalBalance).toBe("string");
  });
});

describe("suiMemoryHead", () => {
  it("update without a key throws before any network call", async () => {
    const head = suiMemoryHead({ packageId: "0x0", objectId: "0x0", network: "testnet" });
    await expect(head.update({ transcript: "x" })).rejects.toThrow(/no key/);
  });
});
