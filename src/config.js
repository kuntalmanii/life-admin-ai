import { clusterApiUrl } from "@solana/web3.js";

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? "" : "http://localhost:3001");

export const SOLANA_NETWORK =
  import.meta.env.VITE_SOLANA_NETWORK || "testnet";

export const SOLANA_RPC_URL =
  import.meta.env.VITE_SOLANA_RPC_URL || clusterApiUrl(SOLANA_NETWORK);

export const VERIFIER_WALLET =
  import.meta.env.VITE_VERIFIER_WALLET ||
  "FBuJ9xHqG4tATW5wKJAn1uRKpM4WujNtKfA25CzXNBhy";

export const IPFS_GATEWAY = "https://ipfs.io/ipfs/";

export const SOL_PRICE_USD = 150;
