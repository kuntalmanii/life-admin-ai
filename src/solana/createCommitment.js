import {
  SystemProgram,
  PublicKey,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { Metaplex, walletAdapterIdentity } from "@metaplex-foundation/js";
import { VERIFIER_WALLET } from "../config";
import { getSolanaConnection } from "./connection";

const ESCROW_PUBLIC_KEY = new PublicKey(VERIFIER_WALLET);

/**
 * Transfers staked SOL to the escrow wallet and mints an on-chain commitment NFT.
 */
export async function createCommitment(wallet, metadataUri, stakeAmount) {
  if (!wallet?.publicKey) {
    throw new Error("Wallet not connected");
  }

  const connection = getSolanaConnection();
  const metaplex = Metaplex.make(connection).use(
    walletAdapterIdentity(wallet)
  );

  const lamports = Math.floor(parseFloat(stakeAmount) * LAMPORTS_PER_SOL);
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

  let nft;
  let response;
  try {
    ({ nft, response } = await metaplex.nfts().create(
      {
        uri: metadataUri,
        name: "Commitment Protocol Task",
        symbol: "COMMIT",
        sellerFeeBasisPoints: 0,
        isMutable: true,
      },
      { commitment: "finalized" }
    ));
  } catch (err) {
    console.error("NFT mint failed:", err);
    throw new Error("NFT minting failed");
  }

  return {
    mintAddress: nft.address.toBase58(),
    nftSignature: response.signature,
    stakeSignature,
    escrow: ESCROW_PUBLIC_KEY.toBase58(),
  };
}
