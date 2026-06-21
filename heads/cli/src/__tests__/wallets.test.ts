import { describe, it, expect } from "vitest";
import { suiWalletsOf, activeSuiWallet, type ThinyConfig } from "../onboarding.js";

describe("sui wallet config", () => {
  it("migrates the legacy single-wallet shape to a list", () => {
    const cfg: ThinyConfig = {
      sui: { network: "testnet", address: "0xA", wallet: { type: "generated", secretKey: "suiprivkeyA" } },
    };
    const wallets = suiWalletsOf(cfg);
    expect(wallets).toHaveLength(1);
    expect(wallets[0]).toMatchObject({ address: "0xA", secretKey: "suiprivkeyA", source: "generated" });
    expect(activeSuiWallet(cfg)?.address).toBe("0xA");
  });

  it("uses wallets[] and activeAddress when present", () => {
    const cfg: ThinyConfig = {
      sui: {
        network: "testnet",
        activeAddress: "0xB",
        wallets: [
          { label: "a", address: "0xA", secretKey: "ka", source: "generated" },
          { label: "b", address: "0xB", secretKey: "kb", source: "imported" },
        ],
      },
    };
    expect(suiWalletsOf(cfg).map((w) => w.address)).toEqual(["0xA", "0xB"]);
    expect(activeSuiWallet(cfg)?.address).toBe("0xB"); // honors the active selection
  });

  it("returns nothing when Sui isn't configured", () => {
    expect(suiWalletsOf(null)).toEqual([]);
    expect(activeSuiWallet({})).toBeUndefined();
  });
});
