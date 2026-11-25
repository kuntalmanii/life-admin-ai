import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { SOLANA_RPC_URL } from "./config.js";

const SYSTEM_PROGRAM_ID = SystemProgram.programId.toBase58();
const connection = new Connection(SOLANA_RPC_URL, "confirmed");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getParsedTransactionWithRetry(signature, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    try {
      const tx = await connection.getParsedTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      if (tx) return tx;
    } catch (err) {
      if (i === attempts - 1) {
        console.error("Failed to fetch transaction from Solana RPC:", err);
      }
    }
    if (i < attempts - 1) await sleep(1200);
  }
  return null;
}

function collectInstructions(tx) {
  const topLevel = tx?.transaction?.message?.instructions || [];
  const inner = (tx?.meta?.innerInstructions || []).flatMap(
    (entry) => entry.instructions || []
  );
  return [...topLevel, ...inner];
}

/**
 * Verifies on-chain that a confirmed SystemProgram.transfer sent >= minSol
 * from expectedFrom to expectedTo.
 */
export async function verifySolTransfer({
  signature,
  expectedFrom,
  expectedTo,
  minSol,
}) {
  if (typeof signature !== "string" || signature.length < 32) {
    return { valid: false, error: "Invalid transaction signature" };
  }

  const tx = await getParsedTransactionWithRetry(signature);
  if (!tx) {
    return {
      valid: false,
      error: "Transaction not found or not yet confirmed on-chain",
    };
  }

  if (tx.meta?.err !== null) {
    return { valid: false, error: "On-chain transaction failed" };
  }

  const minLamports = Math.round(Number(minSol) * LAMPORTS_PER_SOL);
  if (!Number.isFinite(minLamports) || minLamports <= 0) {
    return { valid: false, error: "Invalid expected stake amount" };
  }

  const requiredLamports = Math.max(1, minLamports - 1);
  const matched = collectInstructions(tx).some((ix) => {
    const programId = ix?.programId?.toBase58?.() || "";
    const isSystem = ix?.program === "system" || programId === SYSTEM_PROGRAM_ID;
    if (!isSystem || ix?.parsed?.type !== "transfer") return false;

    const info = ix.parsed.info || {};
    const lamports = Number(info.lamports || 0);
    return (
      info.source === expectedFrom &&
      info.destination === expectedTo &&
      lamports >= requiredLamports
    );
  });

  if (!matched) {
    return {
      valid: false,
      error: "On-chain SOL transfer does not match commitment details",
    };
  }

  return { valid: true };
}

/**
 * Verifies on-chain that expectedOwner currently holds the NFT (1 token of mintAddress).
 */
export async function verifyNftOwnership({ mintAddress, expectedOwner }) {
  try {
    const mintPubkey = new PublicKey(mintAddress);
    const largestAccounts = await connection.getTokenLargestAccounts(
      mintPubkey,
      "confirmed"
    );

    const holder = largestAccounts?.value?.find((acc) => acc.amount === "1");
    if (!holder) {
      return { valid: false, error: "NFT mint has no active holder on-chain" };
    }

    const accountInfo = await connection.getParsedAccountInfo(
      holder.address,
      "confirmed"
    );
    const parsedInfo = accountInfo?.value?.data?.parsed?.info;

    if (
      parsedInfo?.owner !== expectedOwner ||
      parsedInfo?.tokenAmount?.uiAmount !== 1
    ) {
      return {
        valid: false,
        error: "Connected wallet does not own this commitment NFT",
      };
    }

    return { valid: true };
  } catch (err) {
    console.error("NFT ownership check failed:", err);
    return { valid: false, error: "Failed to verify NFT ownership on-chain" };
  }
}
