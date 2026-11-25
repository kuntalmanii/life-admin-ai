import {
  Connection,
  Keypair,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import fs from "fs";
import path from "path";
import { ESCROW_KEYPAIR_PATH, SOLANA_NETWORK } from "./config.js";

/**
 * Transfers staked SOL from the backend escrow keypair back to the user's wallet.
 */
export const refundStake = async ({ toWallet, amountSol }) => {
  console.log(`Init Refund: ${amountSol} SOL -> ${toWallet}`);

  const connection = new Connection(clusterApiUrl(SOLANA_NETWORK), "confirmed");
  const keypairPath = path.resolve(ESCROW_KEYPAIR_PATH);

  if (!fs.existsSync(keypairPath)) {
    throw new Error(`Keypair file not found at ${keypairPath}`);
  }

  const secret = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const escrowKeypair = Keypair.fromSecretKey(new Uint8Array(secret));

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: escrowKeypair.publicKey,
      toPubkey: new PublicKey(toWallet),
      lamports: Math.floor(Number(amountSol) * LAMPORTS_PER_SOL),
    })
  );

  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [escrowKeypair]
  );

  console.log("Refund Confirmed! Sig:", signature);
  return signature;
};
