import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

const TOAST_STYLES = {
  loading: {
    icon: Loader2,
    iconClass: "animate-spin text-indigo-400",
    badgeBg: "bg-indigo-400/15",
    border: "border-indigo-400/25",
    role: "status",
    live: "polite",
  },
  success: {
    icon: CheckCircle2,
    iconClass: "text-teal-300",
    badgeBg: "bg-teal-400/15",
    border: "border-teal-400/25",
    role: "status",
    live: "polite",
  },
  error: {
    icon: AlertCircle,
    iconClass: "text-rose-300",
    badgeBg: "bg-rose-400/15",
    border: "border-rose-400/25",
    role: "alert",
    live: "assertive",
  },
};

export default function StatusToast({ toast }) {
  const variant = toast ? TOAST_STYLES[toast.type] || TOAST_STYLES.success : null;
  const Icon = variant?.icon;

  return (
    <AnimatePresence>
      {toast && variant && (
        <motion.div
          role={variant.role}
          aria-live={variant.live}
          aria-atomic="true"
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          className={`fixed bottom-8 right-8 z-50 text-slate-100 px-5 py-3.5 rounded-2xl flex items-center gap-3 backdrop-blur-xl bg-[#0f1626]/92 border ${variant.border} shadow-2xl`}
        >
          <div className={`p-1.5 rounded-lg ${variant.badgeBg}`} aria-hidden="true">
            <Icon size={16} className={variant.iconClass} />
          </div>
          <span className="font-medium text-sm tracking-wide">{toast.message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
