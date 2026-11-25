import { pinMetadataToIPFS } from "../services/api";

/**
 * Uploads commitment or proof metadata JSON to IPFS through the authenticated backend proxy
 * so Pinata credentials never reach the client bundle.
 */
export async function uploadMetadataToIPFS(metadata, wallet) {
  const { ipfsUri } = await pinMetadataToIPFS(metadata, wallet);
  return ipfsUri;
}
