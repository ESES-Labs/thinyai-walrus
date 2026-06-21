import { SuiJsonRpcClient, getJsonRpcFullnodeUrl, type DevInspectResults } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

/**
 * @thiny/signer-sui — a reusable Sui signer for Thiny agents.
 *
 * `suiSigner` holds the agent's keypair and a Sui RPC client, and exposes:
 *   - `devInspect(tx)`     — dry-run a PTB (keyless; no gas, no signature)
 *   - `signAndExecute(tx)` — sign + submit a built PTB (mainnet guard, off by default)
 *
 * It is the agent's "hand + signature": the keypair here is the `agent` address that an on-chain
 * `agent_wallet` cap trusts. Hard budget/scope/expiry caps live on-chain (a separate Move package);
 * this is only the signing mechanism. `suiMemoryHead` (the Walrus on-chain pointer) is built on top.
 *
 * Standalone by design: Thiny's core `Signer` port is EVM-shaped (address/chainId/signAndSend), which
 * doesn't fit Sui's object/PTB model — so this is a focused adapter, not an implementation of it.
 */

export type SuiNetwork = "mainnet" | "testnet";

/** A 32-byte zero address — a valid sender for keyless `devInspect` dry-runs. */
const ZERO_ADDRESS = `0x${"0".repeat(64)}`;

export interface SuiSignerOptions {
  /** Sui network (drives the default RPC URL + client config). Default `testnet`. */
  network?: SuiNetwork;
  /** Sui fullnode RPC URL. Default: the public fullnode for `network`. */
  rpcUrl?: string;
  /** Sui private key (`suiprivkey1…` from `sui keytool export`). Required to sign. */
  secretKey?: string;
  /** Pre-built keypair (alternative to `secretKey`; e.g. loaded from a keystore). */
  signer?: Ed25519Keypair;
  /** Reuse an existing client instead of constructing one. */
  client?: SuiJsonRpcClient;
  /** MAINNET GUARD: must be explicitly `true` to `signAndExecute` on mainnet. Default `false`. */
  allowMainnet?: boolean;
}

export interface SuiExecuteResult {
  /** Transaction digest. */
  digest: string;
  /** Transaction effects (status, gas, object changes). */
  effects: unknown;
}

export interface SuiSigner {
  /** The signer's Sui address, or `undefined` if no key is configured (read-only mode). */
  readonly address: string | undefined;
  readonly network: SuiNetwork;
  readonly client: SuiJsonRpcClient;
  /** Whether a signing key is configured. */
  hasKey(): boolean;
  /** Dry-run a PTB — no key, no gas. `sender` defaults to the signer address, else the zero address. */
  devInspect(tx: Transaction, opts?: { sender?: string }): Promise<DevInspectResults>;
  /** Sign + submit a built PTB; waits for finality. Throws on mainnet unless `allowMainnet`, or if no key. */
  signAndExecute(tx: Transaction): Promise<SuiExecuteResult>;
}

/** Create a reusable Sui signer. */
export function suiSigner(opts: SuiSignerOptions = {}): SuiSigner {
  const network: SuiNetwork = opts.network ?? "testnet";
  const client =
    opts.client ??
    new SuiJsonRpcClient({ url: opts.rpcUrl ?? getJsonRpcFullnodeUrl(network), network });
  const keypair =
    opts.signer ?? (opts.secretKey ? Ed25519Keypair.fromSecretKey(opts.secretKey) : undefined);
  const address = keypair?.getPublicKey().toSuiAddress();

  return {
    address,
    network,
    client,
    hasKey: () => keypair !== undefined,

    devInspect(tx, devOpts) {
      return client.devInspectTransactionBlock({
        sender: devOpts?.sender ?? address ?? ZERO_ADDRESS,
        transactionBlock: tx,
      });
    },

    async signAndExecute(tx) {
      if (!keypair) {
        throw new Error("suiSigner.signAndExecute: no key configured (pass `secretKey` or `signer`).");
      }
      if (network === "mainnet" && opts.allowMainnet !== true) {
        throw new Error(
          "suiSigner: refusing to sign on mainnet. Pass `allowMainnet: true` to opt in.",
        );
      }
      const result = await client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: { showEffects: true },
      });
      await client.waitForTransaction({ digest: result.digest });
      return { digest: result.digest, effects: result.effects ?? null };
    },
  };
}

// ── memory-head (Walrus on-chain pointer) — public API unchanged, now built on suiSigner ──

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
  network?: SuiNetwork;
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
  // The memory-head pointer is owner-controlled and intentional; allow mainnet so behavior is
  // unchanged from before suiSigner existed (its writes aren't gated by the mainnet guard).
  const signer = suiSigner({
    network: opts.network,
    rpcUrl: opts.rpcUrl,
    secretKey: opts.secretKey,
    signer: opts.signer,
    client: opts.client,
    allowMainnet: true,
  });

  async function read(): Promise<MemoryHeadPointers> {
    const res = await signer.client.getObject({ id: opts.objectId, options: { showContent: true } });
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
    address: signer.address,
    read,
    async update(pointers) {
      if (!signer.hasKey()) {
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
      const result = await signer.signAndExecute(tx);
      return result.digest;
    },
  };
}
