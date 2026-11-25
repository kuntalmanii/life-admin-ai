import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fs from "node:fs";
import {
  DEFAULT_VERIFIER,
  ESCROW_KEYPAIR_PATH,
  SOLANA_RPC_URL,
} from "../config.js";

const checkBalance = async () => {
  const connection = new Connection(SOLANA_RPC_URL, "confirmed");
  const target = process.argv[2] || DEFAULT_VERIFIER;
  const targetPubkey = new PublicKey(target);
  const targetBal = await connection.getBalance(targetPubkey);
  console.log(`VERIFIER(${targetPubkey.toBase58()}): ${targetBal / LAMPORTS_PER_SOL} SOL`);

  if (!process.argv[2] && fs.existsSync(ESCROW_KEYPAIR_PATH)) {
    const secret = JSON.parse(fs.readFileSync(ESCROW_KEYPAIR_PATH, "utf-8"));
    const escrowPubkey = Keypair.fromSecretKey(new Uint8Array(secret)).publicKey;
    if (escrowPubkey.toBase58() !== targetPubkey.toBase58()) {
      const escrowBal = await connection.getBalance(escrowPubkey);
      console.log(`ESCROW(${escrowPubkey.toBase58()}): ${escrowBal / LAMPORTS_PER_SOL} SOL`);
    }
  }
};

checkBalance();
