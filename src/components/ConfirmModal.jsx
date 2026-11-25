import { useId, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { useAccessibleModal } from "../hooks/useAccessibleModal";

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  destructive = false,
  onConfirm,
  onCancel,
}) {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef(null);

  useAccessibleModal(open, onCancel, dialogRef);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/65 backdrop-blur-md"
          onClick={(e) => {
            if (e.target === e.currentTarget) onCancel?.();
          }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            className="w-full max-w-md rounded-3xl overflow-hidden bg-[#0f1626] border border-slate-400/15 shadow-2xl outline-none"
          >
            <div className="p-6 border-b border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  aria-hidden="true"
                  className={`p-2 rounded-xl ${
                    destructive
                      ? "bg-rose-400/15 text-rose-300"
                      : "bg-indigo-400/15 text-indigo-300"
                  }`}
                >
                  <AlertTriangle size={18} />
                </div>
                <h2 id={titleId} className="text-base font-bold text-slate-100">
                  {title}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close confirmation dialog"
                onClick={onCancel}
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="p-6">
              <p id={descId} className="text-sm text-slate-300 leading-relaxed">
                {message}
              </p>
            </div>

            <div className="px-6 py-4 bg-[#080c16]/60 border-t border-slate-800/80 flex justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-200 bg-slate-800/80 hover:bg-slate-700/80 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={`px-4 py-2 rounded-xl text-sm font-bold text-white transition-all cursor-pointer ${
                  destructive
                    ? "bg-gradient-to-r from-rose-600 to-rose-500 hover:opacity-90"
                    : "bg-gradient-to-r from-teal-600 to-teal-500 hover:opacity-90"
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
