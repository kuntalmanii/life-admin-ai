import { useId, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { motion } from "framer-motion";
import { Send, Loader2, CheckCircle2, Link2 } from "lucide-react";
import { uploadMetadataToIPFS } from "../ipfs/uploadMetadata";
import { submitProof as submitProofRequest } from "../services/api";

export default function SubmitProof({
  mintAddress,
  commitment,
  onSubmitted,
  onNotify,
}) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const wallet = useWallet();
  const { publicKey } = wallet;

  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [focused, setFocused] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmitProof = async () => {
    if (!publicKey) {
      const msg = "Please connect your wallet first.";
      setErrorMsg(msg);
      onNotify?.(msg, "error");
      return;
    }
    if (!text.trim()) {
      const msg = "Add a proof description or link before submitting.";
      setErrorMsg(msg);
      onNotify?.(msg, "error");
      return;
    }

    setErrorMsg("");
    setLoading(true);
    try {
      const proofMetadata = {
        type: "commitment_proof",
        mintAddress,
        description: text.trim(),
        submittedAt: new Date().toISOString(),
      };
      const proofCid = await uploadMetadataToIPFS(proofMetadata, wallet);

      const result = await submitProofRequest(
        {
          mintAddress,
          proofCid,
          proofDescription: text.trim(),
          submittedBy: publicKey.toBase58(),
          recovery: {
            service: commitment?.service,
            proofCriteria: commitment?.proofCriteria,
            stake: commitment?.stake,
            deadline: commitment?.deadline,
          },
        },
        wallet
      );

      setSuccess(true);
      setText("");
      const confidence = result?.aiAssessment?.confidence;
      onNotify?.(
        Number.isFinite(confidence)
          ? `Proof submitted! AI Copilot confidence: ${confidence}%`
          : "Proof submitted for verification!",
        "success"
      );

      setTimeout(() => {
        setSuccess(false);
        onSubmitted?.();
      }, 2000);
    } catch (e) {
      console.error(e);
      const msg = e.message || "Proof submission failed";
      setErrorMsg(msg);
      onNotify?.(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <motion.div
        role="status"
        aria-live="polite"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-teal-400/10 border border-teal-400/25 text-teal-200"
      >
        <CheckCircle2 size={16} aria-hidden="true" />
        Proof submitted! Awaiting review.
      </motion.div>
    );
  }

  return (
    <div className="space-y-2.5">
      {commitment?.proofCriteria && (
        <p className="text-[11px] text-indigo-200/95 bg-indigo-400/[0.07] border border-indigo-400/20 rounded-xl px-3 py-2">
          <strong>Expected Proof:</strong> {commitment.proofCriteria}
        </p>
      )}
      <label htmlFor={inputId} className="sr-only">
        Proof link or completion summary for {commitment?.service || "commitment"}
      </label>
      <div className="relative">
        <div className="absolute top-3 left-3 pointer-events-none" aria-hidden="true">
          <Link2
            size={14}
            className={focused ? "text-sky-300" : "text-slate-400"}
          />
        </div>
        <textarea
          id={inputId}
          value={text}
          aria-label={`Proof link or completion summary for ${commitment?.service || "commitment"}`}
          aria-invalid={Boolean(errorMsg)}
          aria-describedby={errorMsg ? errorId : undefined}
          onChange={(e) => {
            setText(e.target.value);
            if (errorMsg) setErrorMsg("");
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          rows={2}
          placeholder="Paste proof link or describe your completion..."
          className={`w-full rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-400 outline-none resize-none transition-all bg-white/[0.03] border ${
            errorMsg
              ? "border-rose-400/60"
              : focused
              ? "border-sky-300/45 ring-3 ring-sky-300/10"
              : "border-slate-400/15"
          }`}
        />
      </div>

      {errorMsg && (
        <p id={errorId} role="alert" className="text-xs text-rose-300 font-medium">
          {errorMsg}
        </p>
      )}

      <motion.button
        type="button"
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.985 }}
        onClick={handleSubmitProof}
        disabled={loading || !text.trim()}
        className="w-full py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-[0_4px_16px_rgba(99,102,241,0.25)]"
        style={{
          background: "linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)",
        }}
      >
        {loading ? (
          <>
            <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Uploading...
          </>
        ) : (
          <>
            <Send size={14} aria-hidden="true" /> Submit Proof
          </>
        )}
      </motion.button>
    </div>
  );
}
