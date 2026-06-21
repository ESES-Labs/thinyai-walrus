import { describe, it, expect, vi } from "vitest";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { suiMemoryHead } from "../index.js";

function fakeClient(fields: Record<string, unknown>): SuiJsonRpcClient {
  return {
    getObject: vi.fn(async () => ({ data: { content: { dataType: "moveObject", fields } } })),
    signAndExecuteTransaction: vi.fn(async () => ({ digest: "0xdigest" })),
    waitForTransaction: vi.fn(async () => ({})),
  } as unknown as SuiJsonRpcClient;
}

const fakeSigner = {
  getPublicKey: () => ({ toSuiAddress: () => "0xowner" }),
} as unknown as Ed25519Keypair;

const FIELDS = {
  owner: "0xowner",
  latest_transcript_blob: "blob-transcript",
  latest_audit_blob: "blob-audit",
  updated_at_ms: "1700000000000",
};

describe("suiMemoryHead", () => {
  it("read() parses the on-chain Move fields into pointers", async () => {
    const head = suiMemoryHead({
      packageId: "0xpkg",
      objectId: "0xobj",
      client: fakeClient(FIELDS),
    });
    expect(await head.read()).toEqual({
      transcript: "blob-transcript",
      audit: "blob-audit",
      owner: "0xowner",
      updatedAtMs: 1700000000000,
    });
  });

  it("read() throws when the object has no Move content", async () => {
    const client = {
      getObject: vi.fn(async () => ({ data: { content: null } })),
    } as unknown as SuiJsonRpcClient;
    const head = suiMemoryHead({ packageId: "0xpkg", objectId: "0xobj", client });
    await expect(head.read()).rejects.toThrow(/no readable Move content/);
  });

  it("update() requires a key", async () => {
    const head = suiMemoryHead({
      packageId: "0xpkg",
      objectId: "0xobj",
      client: fakeClient(FIELDS),
    });
    await expect(head.update({ transcript: "new" })).rejects.toThrow(/no key configured/);
  });

  it("update() signs + executes and returns the tx digest", async () => {
    const head = suiMemoryHead({
      packageId: "0xpkg",
      objectId: "0xobj",
      client: fakeClient(FIELDS),
      signer: fakeSigner,
    });
    expect(await head.update({ transcript: "new-transcript" })).toBe("0xdigest");
  });

  it("exposes the signer address when a key is configured", () => {
    const withKey = suiMemoryHead({
      packageId: "0xpkg",
      objectId: "0xobj",
      client: fakeClient(FIELDS),
      signer: fakeSigner,
    });
    const noKey = suiMemoryHead({
      packageId: "0xpkg",
      objectId: "0xobj",
      client: fakeClient(FIELDS),
    });
    expect(withKey.address).toBe("0xowner");
    expect(noKey.address).toBeUndefined();
  });
});
