import { useEffect, useId, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  Clock,
  Wallet,
  CheckCircle,
  Shield,
  ExternalLink,
  CalendarDays,
  Flame,
  Hourglass,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import SubmitProof from "./SubmitProof";
import { SOLANA_NETWORK } from "../config";
import {
  computeElapsedPercent,
  formatUsdEstimate,
  isCommitmentActive,
} from "../utils/format";

const COUNTDOWN_TICK_MS = 30_000;

const listVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", bounce: 0.2 },
  },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.2 } },
};

const STATUS = {
  PENDING: {
    label: "Active",
    color: "#c7d2fe",
    bg: "rgba(129, 140, 248, 0.14)",
    border: "rgba(129, 140, 248, 0.30)",
    icon: Hourglass,
    barColor: "#818cf8",
  },
  ON_CHAIN_ONLY: {
    label: "Active",
    color: "#c7d2fe",
    bg: "rgba(129, 140, 248, 0.14)",
    border: "rgba(129, 140, 248, 0.30)",
    icon: Hourglass,
    barColor: "#818cf8",
  },
  PROOF_SUBMITTED: {
    label: "In Review",
    color: "#bae6fd",
    bg: "rgba(125, 211, 252, 0.14)",
    border: "rgba(125, 211, 252, 0.30)",
    icon: Zap,
    barColor: "#38bdf8",
  },
  COMPLETED: {
    label: "Done ✓",
    color: "#99f6e4",
    bg: "rgba(45, 212, 191, 0.14)",
    border: "rgba(45, 212, 191, 0.30)",
    icon: Trophy,
    barColor: "#2dd4bf",
  },
  FAILED: {
    label: "Burned",
    color: "#fecdd3",
    bg: "rgba(251, 113, 133, 0.14)",
    border: "rgba(251, 113, 133, 0.30)",
    icon: Flame,
    barColor: "#fb7185",
  },
};

const TABS = [
  { id: "ALL", label: "All", color: "#e2e8f0" },
  { id: "PENDING", label: "Active", color: "#c7d2fe" },
  { id: "PROOF_SUBMITTED", label: "In Review", color: "#bae6fd" },
  { id: "COMPLETED", label: "Done", color: "#99f6e4" },
  { id: "FAILED", label: "Burned", color: "#fecdd3" },
];

function getStatus(status) {
  return STATUS[status] || STATUS.PENDING;
}

function Countdown({ deadline, nowMs }) {
  if (!deadline) return <span className="text-slate-400 text-xs">No deadline</span>;
  const diff = new Date(deadline).getTime() - nowMs;
  if (diff <= 0) {
    return <span className="text-rose-200 text-xs font-semibold">Expired</span>;
  }

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);

  if (days > 0) return <span className="text-slate-300 text-xs">{days}d {hours}h left</span>;
  if (hours > 0) return <span className="text-amber-200 text-xs font-semibold">{hours}h {mins}m left</span>;
  return <span className="text-rose-200 text-xs font-semibold animate-pulse">{mins}m left!</span>;
}

function StatusBadge({ status }) {
  const cfg = getStatus(status);
  const Icon = cfg.icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}
    >
      <Icon size={12} aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

function CommitmentCard({ r, nowMs, onRefresh, onNotify }) {
  const cfg = getStatus(r.status);
  const active = isCommitmentActive(r.status);
  const sol = parseFloat(r.stake || 0);
  const elapsedPct = computeElapsedPercent(r.createdAt, r.deadline, nowMs);

  return (
    <motion.article
      layout
      variants={cardVariants}
      className="relative rounded-2xl overflow-hidden group transition-all bg-[#0f1626]/72 backdrop-blur-xl"
      style={{
        border: `1px solid ${active ? cfg.border : "rgba(148, 163, 184, 0.14)"}`,
        boxShadow: active
          ? `0 12px 30px rgba(8, 12, 22, 0.45), 0 0 20px ${cfg.barColor}14`
          : "0 8px 24px rgba(8, 12, 22, 0.35)",
      }}
    >
      <div
        aria-hidden="true"
        className="h-[2px] opacity-80"
        style={{ background: `linear-gradient(90deg, ${cfg.barColor}, transparent)` }}
      />

      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-bold text-slate-100 text-sm leading-snug line-clamp-2 flex-1">
            {r.service}
          </h3>
          <StatusBadge status={r.status} />
        </div>

        <div className="flex items-center gap-4 mb-4 text-xs text-slate-300">
          <span className="flex items-center gap-1">
            <Clock size={11} aria-hidden="true" />
            {r.deadline
              ? new Date(r.deadline).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "2-digit",
                })
              : "—"}
          </span>
          {active && <Countdown deadline={r.deadline} nowMs={nowMs} />}
          <a
            href={`https://solscan.io/token/${r.mint}?cluster=${SOLANA_NETWORK}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`View ${r.service} token on Solscan Explorer`}
            className="ml-auto flex items-center gap-1 text-slate-300 hover:text-indigo-200 transition-colors"
          >
            <ExternalLink size={10} aria-hidden="true" />
            Explorer
          </a>
        </div>

        <div className="flex items-center gap-3 rounded-xl p-3 mb-4 bg-white/[0.03] border border-slate-400/12">
          <div className="p-1.5 rounded-lg bg-teal-400/10 border border-teal-400/18" aria-hidden="true">
            <Wallet size={14} className="text-teal-300" />
          </div>
          <div className="flex-1">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
              Staked
            </p>
            <p className="font-mono font-bold text-slate-100 text-sm">{sol} SOL</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
              ~USD
            </p>
            <p className="text-xs text-slate-300 font-mono">
              ${formatUsdEstimate(sol, 0)}
            </p>
          </div>
        </div>

        {active && r.deadline && (
          <div className="mb-4">
            <div className="flex justify-between text-[10px] text-slate-400 mb-1.5">
              <span>Time elapsed</span>
              <span>{elapsedPct}%</span>
            </div>
            <div
              role="progressbar"
              aria-label={`Elapsed time for ${r.service}`}
              aria-valuenow={elapsedPct}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-1.5 rounded-full overflow-hidden bg-slate-400/15"
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${elapsedPct}%`,
                  background: `linear-gradient(90deg, ${cfg.barColor}, ${
                    elapsedPct > 80 ? "#fb7185" : cfg.barColor
                  }99)`,
                }}
              />
            </div>
          </div>
        )}

        {r.status === "COMPLETED" ? (
          <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold bg-teal-400/10 border border-teal-400/25 text-teal-200">
            <CheckCircle size={15} aria-hidden="true" /> Funds Released
          </div>
        ) : r.status === "FAILED" ? (
          <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold bg-rose-400/10 border border-rose-400/25 text-rose-200">
            <Flame size={15} aria-hidden="true" /> Stake Burned
          </div>
        ) : (
          <SubmitProof
            mintAddress={r.mint}
            commitment={r}
            onSubmitted={onRefresh}
            onNotify={onNotify}
          />
        )}
      </div>
    </motion.article>
  );
}

export default function ReminderList({ reminders, loading, onRefresh, onNotify }) {
  const baseId = useId();
  const [activeTab, setActiveTab] = useState("ALL");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), COUNTDOWN_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const counts = useMemo(() => {
    const next = {
      ALL: reminders.length,
      PENDING: 0,
      PROOF_SUBMITTED: 0,
      COMPLETED: 0,
      FAILED: 0,
    };
    for (const r of reminders) {
      if (r.status === "PENDING" || r.status === "ON_CHAIN_ONLY") {
        next.PENDING += 1;
      } else if (r.status in next) {
        next[r.status] += 1;
      }
    }
    return next;
  }, [reminders]);

  const filtered = useMemo(() => {
    if (activeTab === "ALL") return reminders;
    if (activeTab === "PENDING") {
      return reminders.filter(
        (r) => r.status === "PENDING" || r.status === "ON_CHAIN_ONLY"
      );
    }
    return reminders.filter((r) => r.status === activeTab);
  }, [reminders, activeTab]);

  if (loading && reminders.length === 0) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading commitments">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-40 rounded-2xl animate-pulse bg-[#0f1626]/65 border border-slate-400/10"
          />
        ))}
      </div>
    );
  }

  if (!loading && reminders.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-20 px-6 rounded-3xl text-center bg-[#0f1626]/55 backdrop-blur-xl border border-dashed border-indigo-400/22"
      >
        <div className="relative mb-6" aria-hidden="true">
          <div className="absolute inset-0 rounded-full bg-indigo-400/18 blur-2xl scale-150" />
          <div className="relative w-20 h-20 rounded-2xl flex items-center justify-center bg-indigo-400/10 border border-indigo-400/24">
            <Shield size={34} className="text-indigo-300" />
          </div>
        </div>

        <h2 className="text-xl font-bold text-slate-100 mb-2">
          No commitments yet
        </h2>
        <p className="text-slate-300 text-sm max-w-xs leading-relaxed mb-6">
          Lock your first goal on-chain with SOL staked as collateral.
          Accountability starts here.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-6">
          {[
            { icon: <TrendingUp size={14} className="text-indigo-300" aria-hidden="true" />, label: "Track progress" },
            { icon: <Wallet size={14} className="text-indigo-300" aria-hidden="true" />, label: "Stake SOL" },
            { icon: <Trophy size={14} className="text-indigo-300" aria-hidden="true" />, label: "Earn reputation" },
          ].map(({ icon, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-xs text-slate-300">
              {icon}
              {label}
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  const activeTabId = `${baseId}-tab-${activeTab}`;
  const panelId = `${baseId}-panel`;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <CalendarDays size={18} className="text-teal-300" aria-hidden="true" />
            My Commitments
          </h2>
          <p className="text-xs text-slate-300 mt-0.5">
            {reminders.length} total commitment{reminders.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh commitments"
          className="group flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl transition-all text-slate-300 hover:text-indigo-200 cursor-pointer bg-[#0f1626]/72 border border-slate-400/15"
        >
          <RefreshCw
            size={12}
            aria-hidden="true"
            className={`transition-transform duration-500 ${
              loading ? "animate-spin" : "group-hover:rotate-180"
            }`}
          />
          Refresh
        </button>
      </div>

      <div
        role="tablist"
        aria-label="Filter commitments by status"
        className="flex items-center gap-1 mb-6 p-1.5 rounded-2xl bg-[#0f1626]/65 border border-slate-400/12"
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          const tabCount = counts[tab.id] || 0;
          return (
            <button
              key={tab.id}
              id={`${baseId}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={panelId}
              onClick={() => setActiveTab(tab.id)}
              className="relative flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
              style={{
                background: active ? "rgba(255, 255, 255, 0.08)" : "transparent",
                color: active ? tab.color : "#94a3b8",
                boxShadow: active ? `0 2px 12px ${tab.color}18` : "none",
              }}
            >
              {tab.label}
              {tabCount > 0 && (
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                  style={{
                    background: active
                      ? `${tab.color}20`
                      : "rgba(148, 163, 184, 0.14)",
                    color: active ? tab.color : "#cbd5e1",
                  }}
                >
                  {tabCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div id={panelId} role="tabpanel" aria-labelledby={activeTabId}>
        <AnimatePresence mode="wait">
          {filtered.length > 0 ? (
            <motion.div
              key={activeTab}
              variants={listVariants}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              <AnimatePresence mode="popLayout">
                {filtered.map((r) => (
                  <CommitmentCard
                    key={r.mint}
                    r={r}
                    nowMs={nowMs}
                    onRefresh={onRefresh}
                    onNotify={onNotify}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div
              key="empty-filter"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-14 rounded-2xl text-slate-400 text-sm bg-[#0f1626]/45 border border-dashed border-slate-400/15"
            >
              No {TABS.find((t) => t.id === activeTab)?.label.toLowerCase()} commitments.
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
