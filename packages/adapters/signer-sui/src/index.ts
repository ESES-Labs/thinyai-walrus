import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

/**
 * @thiny/signer-sui — a thin client for the on-chain `memory_head` Move object.
 *
 * Reads are public (no key); `update` is owner-gated and needs a Sui key. This is the on-chain
 * pointer that replaces a local `pointer.json` — anyone can verify an agent's current brain, and only
 * the owner can rotate it. The Move module lives in `move/memory_head` (publish it, then `create` a
 * shared MemoryHead object — see that package's README).
 *
 * Standalone by design: Thiny's core `Signer` port is EVM-shaped (address/chainId/signAndSend), which
 * doesn't fit Sui's object/PTB model — so this is a focused adapter, not an implementation of it.
 */

export interface MemoryHeadPointers {
  /** Latest transcript blob ID on Walrus (empty string if never set). */
  transcript: string;
  /** Latest audit-trail blob ID on Walrus (empty string if never set). */
  audit: string;
  /** Owner address. */
  owner: string;
  /** Last update time (ms since epoch), as reported on-chain. */
  updatedAtMs: number;
}

export interface SuiMemoryHead {
  /** Read the on-chain pointers (public — no key needed). */
  read(): Promise<MemoryHeadPointers>;
  /**
   * Owner-gated update of the latest blob pointers. Only the fields you pass change; the others are
   * preserved (read-modify-write). Returns the transaction digest. Requires a configured key.
   */
  update(pointers: { transcript?: string; audit?: string }): Promise<string>;
  /** The signer's Sui address, if a key is configured. */
  readonly address: string | undefined;
}

export interface SuiMemoryHeadOptions {
  /** Published package id holding the `memory_head` module. */
  packageId: string;
  /** The shared `MemoryHead` object id to read/update. */
  objectId: string;
  /** Sui network (drives the default RPC URL + client config). Default `testnet`. */
  network?: "mainnet" | "testnet";
  /** Sui fullnode RPC URL. Default: the public fullnode for `network`. */
  rpcUrl?: string;
  /** Sui private key (`suiprivkey1…` from `sui keytool export`). Required for `update`. */
  secretKey?: string;
  /** Inject a `SuiJsonRpcClient` (tests). */
  client?: SuiJsonRpcClient;
  /** Inject a keypair (tests / custom key handling). */
  signer?: Ed25519Keypair;
}

/** The on-chain Move struct fields as returned by `getObject({ showContent: true })`. */
interface MemoryHeadFields {
  owner: string;
  latest_transcript_blob: string;
  latest_audit_blob: string;
  updated_at_ms: string;
}

/** Create a client for an on-chain memory-head pointer. */
export function suiMemoryHead(opts: SuiMemoryHeadOptions): SuiMemoryHead {
  const network = opts.network ?? "testnet";
  const client =
    opts.client ??
    new SuiJsonRpcClient({ url: opts.rpcUrl ?? getJsonRpcFullnodeUrl(network), network });
  const signer =
    opts.signer ?? (opts.secretKey ? Ed25519Keypair.fromSecretKey(opts.secretKey) : undefined);

  async function read(): Promise<MemoryHeadPointers> {
    const res = await client.getObject({ id: opts.objectId, options: { showContent: true } });
    const content = res.data?.content;
    if (content?.dataType !== "moveObject") {
      throw new Error(`suiMemoryHead: object ${opts.objectId} has no readable Move content`);
    }
    // Single boundary cast: the Move struct shape we control (see move/memory_head).
    const fields = content.fields as unknown as MemoryHeadFields;
    return {
      transcript: fields.latest_transcript_blob,
      audit: fields.latest_audit_blob,
      owner: fields.owner,
      updatedAtMs: Number(fields.updated_at_ms),
    };
  }

  return {
    address: signer?.getPublicKey().toSuiAddress(),
    read,
    async update(pointers) {
      if (!signer) {
        throw new Error(
          "suiMemoryHead.update: no key configured. Pass `secretKey` (suiprivkey…) or `signer`.",
        );
      }
      const current = await read();
      const tx = new Transaction();
      tx.moveCall({
        target: `${opts.packageId}::memory_head::update`,
        arguments: [
          tx.object(opts.objectId),
          tx.pure.string(pointers.transcript ?? current.transcript),
          tx.pure.string(pointers.audit ?? current.audit),
          tx.pure.u64(Date.now()),
        ],
      });
      const result = await client.signAndExecuteTransaction({
        signer,
        transaction: tx,
        options: { showEffects: true },
      });
      await client.waitForTransaction({ digest: result.digest });
      return result.digest;
    },
  };
}
