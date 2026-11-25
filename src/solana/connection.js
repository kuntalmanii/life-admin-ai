import { Connection } from "@solana/web3.js";
import { SOLANA_RPC_URL } from "../config";

let sharedConnection = null;

/**
 * Returns a shared Solana RPC Connection singleton so callers avoid
 * re-allocating RPC clients on every read/write operation.
 */
export function getSolanaConnection() {
  if (!sharedConnection) {
    sharedConnection = new Connection(SOLANA_RPC_URL, "confirmed");
  }
  return sharedConnection;
}
