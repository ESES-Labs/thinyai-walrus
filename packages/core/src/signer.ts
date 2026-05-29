import type { Hex } from "./domain/web3.js";

export interface TxRequest {
  to: Hex;
  value?: bigint;
  data?: Hex;
  chainId: number;
}

/**
 * PORT: transaction signer.
 * Adapters: signer-viem (testnet), Circle agent wallet (mainnet).
 * The kernel never imports a concrete implementation.
 */
export interface Signer {
  address: Hex;
  chainId: number;
  isTestnet: boolean;
  signAndSend(tx: TxRequest): Promise<Hex>;
}
