import { Keypair } from "@solana/web3.js";
import fs from "node:fs";
import path from "node:path";
import { ESCROW_KEYPAIR_PATH } from "../config.js";

const check = () => {
  const keypairPath = path.resolve(ESCROW_KEYPAIR_PATH);
  const secret = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const keypair = Keypair.fromSecretKey(new Uint8Array(secret));

  console.log("ACTUAL_KEY:" + keypair.publicKey.toBase58());
};

check();
