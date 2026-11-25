import { Connection, Keypair, clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import { DEFAULT_VERIFIER, ESCROW_KEYPAIR_PATH, SOLANA_NETWORK } from "../config.js";

const checkWallet = async () => {
  try {
    const keypairPath = path.resolve(ESCROW_KEYPAIR_PATH);
    if (!fs.existsSync(keypairPath)) {
      console.log(`❌ ${keypairPath} not found`);
      return;
    }

    const secret = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
    const keypair = Keypair.fromSecretKey(new Uint8Array(secret));
    const pubkey = keypair.publicKey.toBase58();

    console.log("🔑 Loaded Keypair Public Key:", pubkey);
    console.log("🎯 Expected Admin Address:  ", DEFAULT_VERIFIER);

    if (pubkey !== DEFAULT_VERIFIER) {
      console.error("❌ KEY MISMATCH! Keypair does not match DEFAULT_VERIFIER.");
    } else {
      console.log("✅ Key matches Admin Wallet.");
    }

    const connection = new Connection(clusterApiUrl(SOLANA_NETWORK), "confirmed");
    const balance = await connection.getBalance(keypair.publicKey);
    console.log(`💰 Balance: ${balance / LAMPORTS_PER_SOL} SOL`);

    if (balance < 0.11 * LAMPORTS_PER_SOL) {
      console.warn("⚠️ LOW BALANCE! Refund requires stake + fees.");
    } else {
      console.log("✅ Sufficient funds for refund.");
    }
  } catch (e) {
    console.error("Wallet check failed:", e);
  }
};

checkWallet();
