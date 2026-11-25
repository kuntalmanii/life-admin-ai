import { PublicKey } from "@solana/web3.js";
import { publicKey as umiPublicKey } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  fetchAllMetadataByOwner,
  mplTokenMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { SOLANA_RPC_URL } from "../config";

let readOnlyUmi = null;

function getReadOnlyUmi() {
  if (!readOnlyUmi) {
    readOnlyUmi = createUmi(SOLANA_RPC_URL, "confirmed").use(
      mplTokenMetadata()
    );
  }
  return readOnlyUmi;
}

/**
 * Fetches all Metaplex NFTs owned by walletAddress that contain a metadata URI.
 */
export async function fetchMyReminderNFTs(walletAddress) {
  const umi = getReadOnlyUmi();
  const metadataList = await fetchAllMetadataByOwner(
    umi,
    umiPublicKey(walletAddress)
  );

  return metadataList
    .map((meta) => ({
      address: new PublicKey(meta.mint),
      uri: (meta.uri || "").replace(/\0/g, "").trim(),
    }))
    .filter((nft) => Boolean(nft.uri));
}
