import { useCallback, useEffect, useRef, useState } from "react";
import { VERIFIER_WALLET } from "../config";
import { uploadMetadataToIPFS } from "../ipfs/uploadMetadata";
import {
  clearWalletSession,
  fetchCommitments,
  trackCommitment,
} from "../services/api";
import { isCommitmentExpired, sortCommitments } from "../utils/format";
import { fetchIpfsJson, mapWithConcurrency } from "../utils/ipfsCache";

const IPFS_HYDRATION_CONCURRENCY = 4;

function mapDbRecord(record, isDbOnly = false) {
  let derivedStatus = record.status;
  if (derivedStatus === "PENDING" && isCommitmentExpired(record.renewalDate)) {
    derivedStatus = "FAILED";
  }

  return {
    mint: record.mintAddress,
    service: record.service,
    deadline: record.renewalDate,
    createdAt: record.createdAt,
    stake: record.stakeAmount,
    status: derivedStatus,
    proofCid: record.proofCid || null,
    isTracked: true,
    isDbOnly,
  };
}

async function hydrateOnChainNft(nft, dbCommitments) {
  const mint = nft.address.toBase58();
  const dbItem = dbCommitments.find((d) => d.mintAddress === mint);

  if (dbItem) {
    return mapDbRecord(dbItem, false);
  }

  try {
    const meta = await fetchIpfsJson(nft.uri);
    const deadline = meta.deadline || meta.renewalDate;

    return {
      mint,
      service: meta.goal || meta.service || "Unknown Goal",
      deadline,
      createdAt: meta.createdAt || null,
      stake: meta.stake || meta.stakeAmount,
      status: isCommitmentExpired(deadline) ? "FAILED" : "ON_CHAIN_ONLY",
      isTracked: false,
      proofCid: null,
    };
  } catch (err) {
    console.error("Failed to hydrate NFT", mint, err);
    return {
      mint,
      service: "Corrupted Data",
      status: "ERROR",
      isTracked: false,
    };
  }
}

function deduplicateCommitments(items) {
  return items.filter((item, _index, self) => {
    if (item.status === "ON_CHAIN_ONLY" || item.status === "PENDING") {
      const hasTrackedDuplicate = self.some(
        (other) =>
          other.mint !== item.mint &&
          other.service === item.service &&
          other.isTracked
      );
      if (hasTrackedDuplicate && !item.isTracked) return false;
    }
    return true;
  });
}

export function useCommitments(walletContext) {
  const { publicKey, connected } = walletContext;

  const [commitments, setCommitments] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formResetKey, setFormResetKey] = useState(0);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  const notify = useCallback((message, type = "success", durationMs = 4000) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }

    if (!message) {
      setToast(null);
      return;
    }

    setToast({ message, type });
    if (durationMs > 0) {
      toastTimerRef.current = setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, durationMs);
    }
  }, []);

  const ownerAddress = publicKey?.toBase58?.() || null;
  const walletRef = useRef(walletContext);
  walletRef.current = walletContext;
  const refreshTimerRef = useRef(null);

  const loadMyCommitments = useCallback(async () => {
    if (!ownerAddress) return;
    setLoadingData(true);

    try {
      const activeWallet = walletRef.current;

      // Dynamic import keeps Metaplex SDK out of the disconnected initial bundle
      const [{ fetchMyReminderNFTs }, dbCommitments] = await Promise.all([
        import("../solana/fetchMyNFTs"),
        fetchCommitments(activeWallet).catch((e) => {
          console.warn("Backend sync skipped:", e.message);
          return [];
        }),
      ]);

      const nfts = await fetchMyReminderNFTs(ownerAddress);
      const onChainMints = new Set(nfts.map((n) => n.address.toBase58()));

      const enriched = await mapWithConcurrency(
        nfts,
        IPFS_HYDRATION_CONCURRENCY,
        (nft) => hydrateOnChainNft(nft, dbCommitments)
      );

      const dbOnlyItems = dbCommitments
        .filter(
          (d) => d.owner === ownerAddress && !onChainMints.has(d.mintAddress)
        )
        .map((d) => mapDbRecord(d, true));

      const merged = [
        ...enriched.filter((c) => c && c.service !== "Corrupted Data"),
        ...dbOnlyItems,
      ];

      setCommitments(sortCommitments(deduplicateCommitments(merged)));
    } catch (e) {
      console.error("Load Error:", e);
      notify("Failed to load commitments", "error");
    } finally {
      setLoadingData(false);
    }
  }, [ownerAddress, notify]);

  const handleCommit = useCallback(
    async ({ goal, deadline, stake, email }) => {
      if (!ownerAddress) return;

      const activeWallet = walletRef.current;
      const createdAt = new Date().toISOString();

      try {
        setSubmitting(true);
        notify("Uploading agreement to IPFS...", "loading", 0);

        const metadata = {
          type: "commitment_v1",
          goal,
          deadline,
          stake,
          owner: ownerAddress,
          verifier: VERIFIER_WALLET,
          status: "PENDING",
          createdAt,
        };

        const [ipfsUri, { createCommitment }] = await Promise.all([
          uploadMetadataToIPFS(metadata, activeWallet),
          import("../solana/createCommitment"),
        ]);

        notify(`Staking ${stake} SOL & minting contract...`, "loading", 0);
        const { mintAddress, stakeSignature } = await createCommitment(
          activeWallet,
          ipfsUri,
          stake
        );

        notify("Registering commitment...", "loading", 0);
        await trackCommitment(
          {
            mintAddress,
            stakeSignature,
            owner: ownerAddress,
            email,
            metadataUri: ipfsUri,
            service: goal,
            renewalDate: deadline,
            verifier: VERIFIER_WALLET,
            status: "PENDING",
            stakeAmount: stake,
          },
          activeWallet
        );

        notify("Commitment locked on-chain", "success", 2500);
        setFormResetKey((prev) => prev + 1);

        const optimisticItem = {
          mint: mintAddress,
          service: goal,
          deadline,
          createdAt,
          stake,
          status: "PENDING",
          proofCid: null,
          isTracked: true,
          isDbOnly: true,
        };

        setCommitments((prev) =>
          prev.some((c) => c.mint === mintAddress)
            ? prev
            : [optimisticItem, ...prev]
        );

        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => {
          refreshTimerRef.current = null;
          loadMyCommitments();
        }, 2000);
      } catch (err) {
        console.error(err);
        notify(err.message || "Commitment creation failed", "error", 5000);
      } finally {
        setSubmitting(false);
      }
    },
    [ownerAddress, notify, loadMyCommitments]
  );

  useEffect(() => {
    if (connected) {
      loadMyCommitments();
    } else {
      clearWalletSession();
      setCommitments([]);
    }
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [connected, loadMyCommitments]);

  return {
    commitments,
    loadingData,
    submitting,
    formResetKey,
    toast,
    notify,
    loadMyCommitments,
    handleCommit,
  };
}
