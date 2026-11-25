import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fs from "node:fs";
import path from "node:path";
import { ESCROW_KEYPAIR_PATH, SOLANA_RPC_URL } from "../config.js";

const airdrop = async () => {
  const connection = new Connection(SOLANA_RPC_URL, "confirmed");
  const keypairPath = path.resolve(ESCROW_KEYPAIR_PATH);
  const secret = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const keypair = Keypair.fromSecretKey(new Uint8Array(secret));

  console.log("Requesting Airdrop for:", keypair.publicKey.toBase58());
  try {
    const signature = await connection.requestAirdrop(
      keypair.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(signature, "confirmed");
    console.log("✅ Airdrop Successful! Tx:", signature);
  } catch (e) {
    console.error("❌ Airdrop Failed:", e.message);
  }
};

airdrop();
