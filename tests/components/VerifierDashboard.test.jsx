import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Keypair } from "@solana/web3.js";

const mockSendTransaction = vi.fn();
const mockConfirmTransaction = vi.fn();
const mockFetchVerifierTasks = vi.fn();
const mockApproveCommitment = vi.fn();
const mockRejectCommitment = vi.fn();
const mockFetchIpfsJson = vi.fn();
const mockSystemTransfer = vi.fn((params) => ({ type: "transfer", params }));

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

const adminKp = Keypair.generate();
const ownerKp = Keypair.generate();
const verifierAddress = adminKp.publicKey.toBase58();

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({
    connected: true,
    publicKey: adminKp.publicKey,
    sendTransaction: mockSendTransaction,
  }),
  useConnection: () => ({
    connection: {
      confirmTransaction: mockConfirmTransaction,
    },
  }),
}));

vi.mock("../../src/services/api", () => ({
  fetchVerifierTasks: (...args) => mockFetchVerifierTasks(...args),
  approveCommitment: (...args) => mockApproveCommitment(...args),
  rejectCommitment: (...args) => mockRejectCommitment(...args),
}));

vi.mock("../../src/utils/ipfsCache", () => ({
  fetchIpfsJson: (...args) => mockFetchIpfsJson(...args),
}));

import VerifierDashboard from "../../src/components/VerifierDashboard";

describe("VerifierDashboard modals and actions", () => {
  const sampleTasks = [
    {
      mintAddress: "MintProof111111111111111111111111111111111",
      owner: ownerKp.publicKey.toBase58(),
      service: "Run 5km",
      stakeAmount: 0.5,
      renewalDate: "2030-01-01T10:00",
      status: "PROOF_SUBMITTED",
      proofCid: "ipfs://QmProofTest",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchVerifierTasks.mockResolvedValue(sampleTasks);
    mockSendTransaction.mockResolvedValue("TxRefundSig123456789");
    mockConfirmTransaction.mockResolvedValue({ value: { err: null } });
    mockApproveCommitment.mockResolvedValue({ success: true });
    mockRejectCommitment.mockResolvedValue({ success: true });
    mockFetchIpfsJson.mockResolvedValue({
      description: "Finished 5km on Strava",
      submittedAt: "2026-11-25T10:00:00.000Z",
    });
  });

  it("opens and closes the Proof Details modal with dialog ARIA and Escape support", async () => {
    const user = userEvent.setup();
    render(
      <VerifierDashboard walletAddress={verifierAddress} onNotify={vi.fn()} />
    );

    const viewBtn = await screen.findByRole("button", {
      name: /view proof metadata/i,
    });
    await user.click(viewBtn);

    const dialog = await screen.findByRole("dialog", { name: "Proof Details" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Finished 5km on Strava")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Close proof details" })
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("cancels and confirms Approve modal to send SOL refund and notify", async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    render(
      <VerifierDashboard walletAddress={verifierAddress} onNotify={onNotify} />
    );

    const approveBtn = await screen.findByRole("button", { name: /approve/i });
    await user.click(approveBtn);

    expect(
      screen.getByText("Approve Proof & Refund Stake")
    ).toBeInTheDocument();

    // Cancel aborts action
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockSendTransaction).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(
        screen.queryByText("Approve Proof & Refund Stake")
      ).not.toBeInTheDocument();
    });

    // Confirm executes Solana refund + API call
    await user.click(screen.getByRole("button", { name: /^approve$/i }));
    await user.click(
      screen.getByRole("button", { name: "Approve & Refund" })
    );

    await waitFor(() => {
      expect(mockSystemTransfer).toHaveBeenCalledWith(
        expect.objectContaining({
          lamports: 500_000_000,
        })
      );
      expect(mockSendTransaction).toHaveBeenCalledTimes(1);
      expect(mockApproveCommitment).toHaveBeenCalledWith(
        expect.objectContaining({
          mintAddress: "MintProof111111111111111111111111111111111",
          verifier: verifierAddress,
          txSignature: "TxRefundSig123456789",
        }),
        expect.any(Object)
      );
      expect(onNotify).toHaveBeenCalledWith(
        expect.stringContaining("Proof approved!"),
        "success"
      );
    });
  });

  it("confirms Reject modal and forfeits stake via API", async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    render(
      <VerifierDashboard walletAddress={verifierAddress} onNotify={onNotify} />
    );

    const rejectBtn = await screen.findByRole("button", { name: /reject/i });
    await user.click(rejectBtn);

    expect(
      screen.getByText("Reject Proof & Forfeit Stake")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reject Proof" }));

    await waitFor(() => {
      expect(mockRejectCommitment).toHaveBeenCalledWith(
        {
          mintAddress: "MintProof111111111111111111111111111111111",
          verifier: verifierAddress,
        },
        expect.any(Object)
      );
      expect(onNotify).toHaveBeenCalledWith(
        "Proof rejected. Stake forfeited.",
        "success"
      );
    });
  });

  it("avoids duplicate initial loads, rounds fractional SOL lamports accurately, and surfaces partial refund errors", async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    mockFetchVerifierTasks.mockResolvedValue([
      {
        ...sampleTasks[0],
        stakeAmount: 0.57,
      },
    ]);
    mockApproveCommitment.mockRejectedValueOnce(new Error("Session expired"));

    render(
      <VerifierDashboard walletAddress={verifierAddress} onNotify={onNotify} />
    );

    const approveBtn = await screen.findByRole("button", { name: /approve/i });
    expect(mockFetchVerifierTasks).toHaveBeenCalledTimes(1);

    await user.click(approveBtn);
    await user.click(screen.getByRole("button", { name: "Approve & Refund" }));

    await waitFor(() => {
      expect(mockSystemTransfer).toHaveBeenCalledWith(
        expect.objectContaining({
          lamports: 570_000_000,
        })
      );
      expect(onNotify).toHaveBeenCalledWith(
        expect.stringContaining("Refund sent on-chain (TxRefund"),
        "error"
      );
    });
  });
});
