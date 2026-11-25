import {
  SystemProgram,
  PublicKey,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { generateSigner, percentAmount } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
import {
  createNft,
  mplTokenMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { SOLANA_RPC_URL, VERIFIER_WALLET } from "../config";
import { getSolanaConnection } from "./connection";

const ESCROW_PUBLIC_KEY = new PublicKey(VERIFIER_WALLET);

/**
 * Transfers staked SOL to the escrow wallet and mints an on-chain commitment NFT via Metaplex Umi.
 */
export async function createCommitment(wallet, metadataUri, stakeAmount) {
  if (!wallet?.publicKey) {
    throw new Error("Wallet not connected");
  }

  const connection = getSolanaConnection();
  const lamports = Math.round(parseFloat(stakeAmount) * LAMPORTS_PER_SOL);
  if (!Number.isFinite(lamports) || lamports <= 0) {
    throw new Error("Invalid stake amount");
  }

  const transferTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: ESCROW_PUBLIC_KEY,
      lamports,
    })
  );

  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  transferTx.feePayer = wallet.publicKey;
  transferTx.recentBlockhash = latestBlockhash.blockhash;

  let stakeSignature;
  try {
    stakeSignature = await wallet.sendTransaction(transferTx, connection);
    await connection.confirmTransaction(
      {
        signature: stakeSignature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      "confirmed"
    );
  } catch (err) {
    console.error("Stake transfer failed:", err);
    throw new Error("Stake transfer failed. Transaction was not approved.");
  }

  let mint;
  let nftSignature;
  try {
    const umi = createUmi(SOLANA_RPC_URL, "confirmed")
      .use(mplTokenMetadata())
      .use(walletAdapterIdentity(wallet));

    mint = generateSigner(umi);
    const { signature } = await createNft(umi, {
      mint,
      uri: metadataUri,
      name: "Commitment Protocol Task",
      symbol: "COMMIT",
      sellerFeeBasisPoints: percentAmount(0),
      isMutable: true,
    }).sendAndConfirm(umi, { confirm: { commitment: "finalized" } });

    [nftSignature] = base58.deserialize(signature);
  } catch (err) {
    console.error("NFT mint failed:", err);
    throw new Error("NFT minting failed");
  }

  return {
    mintAddress: mint.publicKey.toString(),
    nftSignature,
    stakeSignature,
    escrow: ESCROW_PUBLIC_KEY.toBase58(),
  };
}
