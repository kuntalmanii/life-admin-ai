import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  Transaction,
  SystemProgram,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  RefreshCw,
  Check,
  X,
  FileText,
  User,
  Calendar,
  DollarSign,
} from "lucide-react";
import {
  approveCommitment,
  fetchVerifierTasks,
  rejectCommitment,
} from "../services/api";
import { useAccessibleModal } from "../hooks/useAccessibleModal";
import { isCommitmentExpired, resolveIpfsUrl } from "../utils/format";
import { fetchIpfsJson } from "../utils/ipfsCache";
import ConfirmModal from "./ConfirmModal";

export default function VerifierDashboard({ walletAddress, onNotify }) {
  const { connection } = useConnection();
  const wallet = useWallet();

  const proofTitleId = useId();
  const proofDialogRef = useRef(null);
  const walletRef = useRef(wallet);
  walletRef.current = wallet;

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(null);
  const [viewingProof, setViewingProof] = useState(null);
  const [fetchingProof, setFetchingProof] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);

  const closeProofModal = useCallback(() => setViewingProof(null), []);
  useAccessibleModal(Boolean(viewingProof), closeProofModal, proofDialogRef);

  const loadTasks = useCallback(async () => {
    const activeWallet = walletRef.current;
    if (!walletAddress || !activeWallet?.publicKey) return;
    setLoading(true);
    try {
      const data = await fetchVerifierTasks(walletAddress, activeWallet);
      setTasks(data || []);
    } catch (e) {
      console.error("Failed to load verifier tasks", e);
      onNotify?.(e.message || "Failed to load verifier queue", "error");
    } finally {
      setLoading(false);
    }
  }, [walletAddress, onNotify]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const executeApprove = async (task) => {
    const activeWallet = walletRef.current;
    if (!activeWallet?.connected || !activeWallet?.publicKey) {
      onNotify?.("Please connect the Admin Wallet first.", "error");
      return;
    }

    const lamports = Math.round(Number(task.stakeAmount) * LAMPORTS_PER_SOL);
    if (!Number.isFinite(lamports) || lamports <= 0) {
      onNotify?.("Invalid stake amount on task.", "error");
      return;
    }

    setProcessing(task.mintAddress);
    let sentSignature = null;
    try {
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: activeWallet.publicKey,
          toPubkey: new PublicKey(task.owner),
          lamports,
        })
      );

      const signature = await activeWallet.sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, "confirmed");
      sentSignature = signature;

      await approveCommitment(
        {
          mintAddress: task.mintAddress,
          verifier: walletAddress,
          txSignature: signature,
          clientSide: true,
        },
        activeWallet
      );

      onNotify?.(
        `Proof approved! Refunded (${signature.slice(0, 8)}...)`,
        "success"
      );
      loadTasks();
    } catch (err) {
      console.error(err);
      if (sentSignature) {
        onNotify?.(
          `Refund sent on-chain (${sentSignature.slice(0, 8)}...) but failed to record approval: ${err.message || err}`,
          "error"
        );
      } else {
        onNotify?.(`Approval failed: ${err.message || err}`, "error");
      }
    } finally {
      setProcessing(null);
    }
  };

  const executeReject = async (task) => {
    setProcessing(task.mintAddress);
    try {
      await rejectCommitment(
        {
          mintAddress: task.mintAddress,
          verifier: walletAddress,
        },
        walletRef.current
      );
      onNotify?.("Proof rejected. Stake forfeited.", "success");
      loadTasks();
    } catch (err) {
      console.error(err);
      onNotify?.(err.message || "Rejection failed", "error");
    } finally {
      setProcessing(null);
    }
  };

  const fetchAndShowProof = async (cid) => {
    try {
      setFetchingProof(cid);
      const data = await fetchIpfsJson(cid);
      setViewingProof({ ...data, cid });
    } catch (e) {
      console.error("Failed to fetch proof", e);
      onNotify?.(
        "Failed to load proof metadata. It might still be propagating.",
        "error"
      );
    } finally {
      setFetchingProof(null);
    }
  };

  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    const { type, task } = pendingAction;
    setPendingAction(null);
    if (type === "approve") await executeApprove(task);
    else await executeReject(task);
  };

  return (
    <>
      <div className="rounded-3xl overflow-hidden relative bg-[#0f1626]/78 backdrop-blur-2xl border border-teal-400/22 shadow-[0_20px_50px_rgba(8,12,22,0.55)]">
        <div
          aria-hidden="true"
          className="h-[2px] w-full opacity-80"
          style={{
            background: "linear-gradient(90deg, #2dd4bf, #818cf8, #2dd4bf)",
          }}
        />

        <div className="p-8">
          <div className="flex justify-between items-center mb-8 border-b border-slate-800/80 pb-6">
            <div className="flex items-center gap-3.5">
              <div
                aria-hidden="true"
                className="p-3 rounded-xl bg-teal-400/12 border border-teal-400/25"
              >
                <ShieldCheck size={28} className="text-teal-300" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-100">
                  Verifier Dashboard
                </h1>
                <p className="text-sm mt-0.5 text-teal-200/90">
                  Review Proofs & Release Funds
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={loadTasks}
              disabled={loading}
              aria-label="Refresh verification queue"
              className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-semibold text-sm cursor-pointer bg-teal-400/10 border border-teal-400/24 text-teal-200 hover:bg-teal-400/15"
            >
              <RefreshCw
                size={15}
                aria-hidden="true"
                className={loading ? "animate-spin" : ""}
              />
              Refresh
            </button>
          </div>

          {loading ? (
            <div
              role="status"
              aria-label="Scanning blockchain"
              className="flex flex-col items-center justify-center py-20 text-slate-300 space-y-4"
            >
              <RefreshCw
                size={40}
                aria-hidden="true"
                className="animate-spin text-teal-300"
              />
              <p className="text-sm">Scanning blockchain...</p>
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-4 text-center">
              <ShieldCheck size={44} className="text-slate-500" aria-hidden="true" />
              <p className="text-sm">All clear. No proofs pending verification.</p>
            </div>
          ) : (
            <motion.div layout className="grid gap-5">
              <AnimatePresence>
                {tasks.map((task) => {
                  const expired = isCommitmentExpired(task.renewalDate);
                  const isPending = task.status === "PENDING";
                  const canBurn = isPending && expired;

                  return (
                    <motion.article
                      key={task.mintAddress}
                      layout
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      className={`rounded-2xl p-6 relative overflow-hidden group transition-all border ${
                        canBurn
                          ? "bg-rose-400/[0.06] border-rose-400/30"
                          : isPending
                          ? "bg-white/[0.025] border-slate-400/15"
                          : "bg-teal-400/[0.05] border-teal-400/25"
                      }`}
                    >
                      <div
                        aria-hidden="true"
                        className={`absolute top-0 right-0 w-36 h-36 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none ${
                          canBurn ? "bg-rose-400/12" : "bg-teal-400/8"
                        }`}
                      />

                      <div className="flex flex-col md:flex-row justify-between gap-6 relative z-10">
                        <div className="flex-1 space-y-4">
                          <div className="flex flex-wrap items-center justify-between md:justify-start gap-3">
                            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2.5">
                              {task.service}
                              {canBurn && (
                                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider bg-rose-400/14 text-rose-200 border border-rose-400/28">
                                  Expired
                                </span>
                              )}
                              {isPending && !expired && (
                                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider bg-indigo-400/14 text-indigo-200 border border-indigo-400/28">
                                  Active
                                </span>
                              )}
                            </h2>
                            <span className="px-3 py-1 text-xs font-bold rounded-full flex items-center gap-1 bg-teal-400/10 text-teal-200 border border-teal-400/24">
                              <DollarSign size={12} aria-hidden="true" /> {task.stakeAmount} SOL
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-300">
                            <div className="flex items-center gap-2">
                              <User size={14} className="text-slate-400" aria-hidden="true" />
                              <span className="font-mono text-slate-200">
                                {task.owner?.slice(0, 6)}...
                                {task.owner?.slice(-4)}
                              </span>
                            </div>
                            <div
                              className={`flex items-center gap-2 ${
                                expired ? "text-rose-200 font-semibold" : ""
                              }`}
                            >
                              <Calendar
                                size={14}
                                aria-hidden="true"
                                className={
                                  expired ? "text-rose-300" : "text-slate-400"
                                }
                              />
                              <span>
                                {new Date(task.renewalDate).toLocaleString()}
                              </span>
                            </div>
                          </div>

                          {task.proofCid ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => fetchAndShowProof(task.proofCid)}
                                disabled={fetchingProof === task.proofCid}
                                className="inline-flex items-center gap-2 transition-colors text-sm font-medium px-3.5 py-2 rounded-xl cursor-pointer bg-sky-300/10 border border-sky-300/24 text-sky-200 hover:bg-sky-300/15"
                              >
                                {fetchingProof === task.proofCid ? (
                                  <RefreshCw className="animate-spin" size={15} aria-hidden="true" />
                                ) : (
                                  <FileText size={15} aria-hidden="true" />
                                )}
                                View Proof Metadata
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-sm italic">
                              {expired
                                ? "No proof submitted before deadline."
                                : "Waiting for user submission..."}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-row md:flex-col gap-3 justify-center min-w-[150px]">
                          {isPending ? (
                            canBurn ? (
                              <button
                                type="button"
                                disabled={processing === task.mintAddress}
                                onClick={() =>
                                  setPendingAction({ type: "burn", task })
                                }
                                className="w-full flex items-center justify-center gap-2 text-white py-3 px-4 rounded-xl font-bold transition-all disabled:opacity-50 cursor-pointer shadow-[0_4px_18px_rgba(244,63,94,0.25)]"
                                style={{
                                  background:
                                    "linear-gradient(135deg, #e11d48, #fb7185)",
                                }}
                              >
                                <X size={17} aria-hidden="true" /> Burn Stake
                              </button>
                            ) : (
                              <div className="text-center p-3 rounded-xl text-slate-300 text-xs font-medium bg-white/[0.03] border border-slate-400/15">
                                Actions Locked
                                <br />
                                Until Proof
                              </div>
                            )
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={processing === task.mintAddress}
                                onClick={() =>
                                  setPendingAction({ type: "approve", task })
                                }
                                className="flex-1 flex items-center justify-center gap-2 text-white py-2.5 px-4 rounded-xl font-semibold transition-all disabled:opacity-50 cursor-pointer shadow-[0_4px_16px_rgba(45,212,191,0.22)]"
                                style={{
                                  background:
                                    "linear-gradient(135deg, #0d9488, #14b8a6)",
                                }}
                              >
                                {processing === task.mintAddress ? (
                                  <RefreshCw
                                    className="animate-spin"
                                    size={17}
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <>
                                    <Check size={17} aria-hidden="true" /> Approve
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                disabled={processing === task.mintAddress}
                                onClick={() =>
                                  setPendingAction({ type: "reject", task })
                                }
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold transition-all disabled:opacity-50 cursor-pointer bg-rose-400/10 text-rose-200 border border-rose-400/24 hover:bg-rose-400/15"
                              >
                                <X size={17} aria-hidden="true" /> Reject
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </motion.article>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        open={Boolean(pendingAction)}
        title={
          pendingAction?.type === "approve"
            ? "Approve Proof & Refund Stake"
            : pendingAction?.type === "burn"
            ? "Burn Expired Stake"
            : "Reject Proof & Forfeit Stake"
        }
        message={
          pendingAction?.type === "approve"
            ? `Approve "${pendingAction.task.service}" and refund ${pendingAction.task.stakeAmount} SOL back to the owner?`
            : `Forfeit ${pendingAction?.task.stakeAmount} SOL for "${pendingAction?.task.service}"? This marks the commitment as failed.`
        }
        confirmLabel={
          pendingAction?.type === "approve"
            ? "Approve & Refund"
            : pendingAction?.type === "burn"
            ? "Burn Stake"
            : "Reject Proof"
        }
        destructive={pendingAction?.type !== "approve"}
        onConfirm={handleConfirmAction}
        onCancel={() => setPendingAction(null)}
      />

      {/* Proof Modal */}
      <AnimatePresence>
        {viewingProof && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/65 backdrop-blur-md"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeProofModal();
            }}
          >
            <motion.div
              ref={proofDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={proofTitleId}
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              className="rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden bg-[#0f1626] border border-slate-400/16 outline-none"
            >
              <div className="p-6 border-b border-slate-800/80 flex justify-between items-center">
                <h2
                  id={proofTitleId}
                  className="text-lg font-bold text-slate-100 flex items-center gap-2"
                >
                  <FileText className="text-indigo-400" size={20} aria-hidden="true" />
                  Proof Details
                </h2>
                <button
                  type="button"
                  aria-label="Close proof details"
                  onClick={closeProofModal}
                  className="p-2 hover:bg-slate-800/80 rounded-full text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>

              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Proof Description
                  </p>
                  <p className="text-slate-100 mt-1 text-base leading-relaxed">
                    {viewingProof.description || "No description provided."}
                  </p>
                </div>

                {viewingProof.image && (
                  <div className="rounded-2xl overflow-hidden border border-slate-800 mt-4">
                    <img
                      src={resolveIpfsUrl(viewingProof.image)}
                      alt="Submitted proof evidence"
                      className="w-full h-auto object-cover"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Submitted
                    </p>
                    <p className="text-slate-200 font-mono text-sm mt-1">
                      {viewingProof.submittedAt || viewingProof.timestamp
                        ? new Date(
                            viewingProof.submittedAt || viewingProof.timestamp
                          ).toLocaleString()
                        : "Unknown Date"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      IPFS CID
                    </p>
                    <a
                      href={resolveIpfsUrl(viewingProof.cid)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-200 font-mono text-sm mt-1 block truncate hover:underline"
                    >
                      {viewingProof.cid.replace("ipfs://", "").slice(0, 15)}...
                    </a>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-slate-800/80 flex justify-end bg-[#080c16]/50">
                <button
                  type="button"
                  onClick={closeProofModal}
                  className="px-4 py-2 bg-slate-800/80 text-slate-100 rounded-xl hover:bg-slate-700/80 transition-colors font-medium text-sm cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
