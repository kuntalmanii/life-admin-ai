import { beforeEach, describe, expect, it, vi } from "vitest";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";

const mockGetLatestBlockhash = vi.fn();
const mockConfirmTransaction = vi.fn();
const mockSystemTransfer = vi.fn((params) => ({ type: "transfer", params }));
const mockSendAndConfirm = vi.fn();
const mockCreateNft = vi.fn(() => ({
  sendAndConfirm: mockSendAndConfirm,
}));
const mockFetchAllMetadataByOwner = vi.fn();
const mockUse = vi.fn();

const fakeUmiInstance = {
  use: mockUse,
};
mockUse.mockReturnValue(fakeUmiInstance);

vi.mock("@solana/web3.js", async () => {
  const actual = await vi.importActual("@solana/web3.js");
  return {
    ...actual,
    SystemProgram: {
      ...actual.SystemProgram,
      transfer: (...args) => mockSystemTransfer(...args),
    },
    Transaction: class MockTransaction {
      constructor() {
        this.instructions = [];
      }
      add(ix) {
        this.instructions.push(ix);
        return this;
      }
    },
  };
});

vi.mock("../../src/solana/connection", () => ({
  getSolanaConnection: () => ({
    getLatestBlockhash: mockGetLatestBlockhash,
    confirmTransaction: mockConfirmTransaction,
  }),
}));

const generatedMint = Keypair.generate().publicKey.toBase58();
vi.mock("@metaplex-foundation/umi", async () => {
  const actual = await vi.importActual("@metaplex-foundation/umi");
  return {
    ...actual,
    generateSigner: vi.fn(() => ({ publicKey: generatedMint })),
  };
});

vi.mock("@metaplex-foundation/umi-bundle-defaults", () => ({
  createUmi: vi.fn(() => fakeUmiInstance),
}));

vi.mock("@metaplex-foundation/umi-signer-wallet-adapters", () => ({
  walletAdapterIdentity: vi.fn((w) => ({ plugin: "wallet", w })),
}));

vi.mock("@metaplex-foundation/mpl-token-metadata", () => ({
  mplTokenMetadata: vi.fn(() => ({ plugin: "mplTokenMetadata" })),
  createNft: (...args) => mockCreateNft(...args),
  fetchAllMetadataByOwner: (...args) => mockFetchAllMetadataByOwner(...args),
}));

import { createCommitment } from "../../src/solana/createCommitment";
import { fetchMyReminderNFTs } from "../../src/solana/fetchMyNFTs";

describe("Solana Umi integration modules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUse.mockReturnValue(fakeUmiInstance);
    mockGetLatestBlockhash.mockResolvedValue({
      blockhash: "11111111111111111111111111111111",
      lastValidBlockHeight: 100,
    });
    mockConfirmTransaction.mockResolvedValue({ value: { err: null } });
    mockSendAndConfirm.mockResolvedValue({
      signature: new Uint8Array(64).fill(7),
      result: { value: { err: null } },
    });
  });

  it("transfers exact rounded SOL lamports and mints an NFT via Umi", async () => {
    const owner = Keypair.generate().publicKey;
    const wallet = {
      publicKey: owner,
      sendTransaction: vi.fn(async () => "StakeTxSig123"),
    };

    const res = await createCommitment(wallet, "ipfs://QmCommit123", "0.57");

    expect(mockSystemTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        fromPubkey: owner,
        lamports: Math.round(0.57 * LAMPORTS_PER_SOL),
      })
    );
    expect(mockCreateNft).toHaveBeenCalledWith(
      fakeUmiInstance,
      expect.objectContaining({
        uri: "ipfs://QmCommit123",
        symbol: "COMMIT",
        isMutable: true,
      })
    );
    expect(res.mintAddress).toBe(generatedMint);
    expect(res.stakeSignature).toBe("StakeTxSig123");
    expect(typeof res.nftSignature).toBe("string");
    expect(res.nftSignature.length).toBeGreaterThan(20);
  });

  it("fetches owner NFTs via fetchAllMetadataByOwner and strips null padding", async () => {
    const owner = Keypair.generate().publicKey.toBase58();
    const mintA = Keypair.generate().publicKey.toBase58();
    const mintB = Keypair.generate().publicKey.toBase58();

    mockFetchAllMetadataByOwner.mockResolvedValue([
      { mint: mintA, uri: "ipfs://QmValid\0\0\0" },
      { mint: mintB, uri: "\0\0   " },
    ]);

    const items = await fetchMyReminderNFTs(owner);
    expect(items).toHaveLength(1);
    expect(items[0].address.toBase58()).toBe(mintA);
    expect(items[0].uri).toBe("ipfs://QmValid");
  });
});
