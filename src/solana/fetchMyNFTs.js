import { PublicKey } from "@solana/web3.js";
import { Metaplex } from "@metaplex-foundation/js";
import { getSolanaConnection } from "./connection";

let readOnlyMetaplex = null;

function getReadOnlyMetaplex() {
  if (!readOnlyMetaplex) {
    readOnlyMetaplex = Metaplex.make(getSolanaConnection());
  }
  return readOnlyMetaplex;
}

/**
 * Fetches all Metaplex NFTs owned by walletAddress that contain a metadata URI.
 */
export async function fetchMyReminderNFTs(walletAddress) {
  const metaplex = getReadOnlyMetaplex();
  const owner = new PublicKey(walletAddress);
  const nfts = await metaplex.nfts().findAllByOwner({ owner });

  return nfts
    .filter((nft) => nft.uri)
    .map((nft) => ({
      address: nft.address,
      uri: nft.uri,
    }));
}
