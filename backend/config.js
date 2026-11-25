import crypto from "node:crypto";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clusterApiUrl } from "@solana/web3.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

export const PORT = Number(process.env.PORT) || 3001;
export const DB_FILE = process.env.DB_FILE
  ? path.resolve(process.env.DB_FILE)
  : path.join(__dirname, "db.sqlite");
export const DEFAULT_VERIFIER =
  process.env.DEFAULT_VERIFIER || "FBuJ9xHqG4tATW5wKJAn1uRKpM4WujNtKfA25CzXNBhy";
export const APP_URL =
  process.env.APP_URL || "https://life-admin-ai-five.vercel.app";
export const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "testnet";
export const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL || clusterApiUrl(SOLANA_NETWORK);
export const ESCROW_KEYPAIR_PATH = process.env.ESCROW_KEYPAIR_PATH
  ? path.resolve(process.env.ESCROW_KEYPAIR_PATH)
  : path.resolve(__dirname, "..", "escrow.json");

export const PINATA_JWT = process.env.PINATA_JWT || "";
export const ALLOW_SERVER_REFUND = process.env.ALLOW_SERVER_REFUND === "true";
export const ENABLE_TEST_EMAIL = process.env.ENABLE_TEST_EMAIL === "true";

// Generate an unpredictable per-boot secret in dev if AUTH_SECRET isn't configured
export const AUTH_SECRET =
  process.env.AUTH_SECRET || crypto.randomBytes(32).toString("hex");

export const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  `${APP_URL},http://localhost:5173,http://127.0.0.1:5173`
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

export function inspectEscrowKeypair() {
  try {
    const resolved = path.resolve(ESCROW_KEYPAIR_PATH);
    if (!fs.existsSync(resolved)) {
      return { exists: false, matchesVerifier: false, publicKey: null };
    }
    const secret = JSON.parse(fs.readFileSync(resolved, "utf-8"));
    // Ed25519 keypair JSON stores 64 bytes: [32 secret][32 public]
    if (!Array.isArray(secret) || secret.length !== 64) {
      return { exists: true, matchesVerifier: false, publicKey: null };
    }
    return { exists: true, secret: new Uint8Array(secret) };
  } catch {
    return { exists: false, matchesVerifier: false, publicKey: null };
  }
}
