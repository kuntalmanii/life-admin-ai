import { motion } from "framer-motion";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Shield, Zap, TrendingUp, Lock, ChevronRight } from "lucide-react";

const FEATURES = [
  {
    color: "#818cf8",
    icon: Lock,
    title: "Stake SOL",
    description: "Turn procrastinated life-admin deadlines into backed on-chain promises.",
    delay: 0.65,
  },
  {
    color: "#2dd4bf",
    icon: Zap,
    title: "AI Goal Coach",
    description: "AI structures messy tasks into measurable proof criteria before you stake.",
    delay: 0.7,
  },
  {
    color: "#7dd3fc",
    icon: Shield,
    title: "AI Proof Copilot",
    description: "Automated AI scoring evaluates completion evidence for fast verification.",
    delay: 0.75,
  },
  {
    color: "#a5b4fc",
    icon: TrendingUp,
    title: "Get Refunded",
    description: "Approve → SOL is refunded. Miss the deadline → stake is forfeited.",
    delay: 0.8,
  },
];

const TICKER_ITEMS = [
  "Solana Testnet",
  "AI Goal Coach",
  "AI Proof Copilot",
  "SOL Staking",
  "NFT Commitments",
  "IPFS Metadata",
  "Email Reminders",
  "SQLite WAL Persistence",
];

function FeatureCard({ icon, title, description, color, delay }) {
  const Icon = icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.55, ease: "easeOut" }}
      className="glass-card p-6 group cursor-default"
    >
      <div className="flex items-start gap-4">
        <div
          aria-hidden="true"
          className="feature-icon shrink-0"
          style={{ background: `${color}14`, border: `1px solid ${color}28` }}
        >
          <Icon size={22} style={{ color }} />
        </div>
        <div>
          <h3 className="font-bold text-slate-100 text-base mb-1 group-hover:text-indigo-200 transition-colors">
            {title}
          </h3>
          <p className="text-slate-300 text-sm leading-relaxed">{description}</p>
        </div>
      </div>
    </motion.div>
  );
}

function StatBadge({ value, label, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.5 }}
      className="text-center"
    >
      <div className="stat-number text-2xl font-black text-gradient-primary">{value}</div>
      <div className="text-xs text-slate-400 uppercase tracking-wider mt-1">{label}</div>
    </motion.div>
  );
}

export default function HeroSection() {
  return (
    <div className="relative min-h-[85vh] flex flex-col">
      <div className="flex flex-col items-center justify-center flex-1 text-center pt-16 pb-8 px-4">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold tracking-widest uppercase bg-indigo-400/10 border border-indigo-400/25 text-indigo-200">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-indigo-400" aria-hidden="true" />
            Solana Testnet · Protocol v1
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.8 }}
          className="text-6xl sm:text-7xl lg:text-8xl font-black tracking-tight leading-none mb-6"
        >
          <span className="text-slate-100">Stake Your</span>
          <br />
          <span className="text-gradient-primary">Commitments</span>
          <br />
          <span className="text-slate-100 text-5xl sm:text-6xl lg:text-7xl">On-Chain</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="text-lg sm:text-xl text-slate-400 max-w-xl leading-relaxed mb-10"
        >
          Turn your goals into NFT-backed commitments with real SOL at stake.
          Miss the deadline, lose the funds. Deliver, get it back.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="flex flex-col sm:flex-row items-center gap-4 mb-16"
        >
          <div className="relative group">
            <div
              className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl scale-110"
              style={{ background: "linear-gradient(135deg, #818cf8, #2dd4bf)" }}
            />
            <WalletMultiButton />
          </div>

          <a
            href="#features"
            className="flex items-center gap-2 text-slate-300 hover:text-slate-100 transition-colors text-sm font-medium group"
          >
            How it works
            <ChevronRight size={16} aria-hidden="true" className="group-hover:translate-x-1 transition-transform" />
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="flex items-center gap-8 sm:gap-16 mb-16"
        >
          <StatBadge value="100%" label="On-Chain" delay={0.5} />
          <div className="w-px h-10 bg-slate-700/50" />
          <StatBadge value="NFT" label="Backed" delay={0.6} />
          <div className="w-px h-10 bg-slate-700/50" />
          <StatBadge value="SOL" label="Staked" delay={0.7} />
        </motion.div>
      </div>

      <div id="features" className="max-w-5xl mx-auto w-full px-4 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="text-center mb-10"
        >
          <span className="text-xs font-bold tracking-widest uppercase text-slate-400">
            How it works
          </span>
          <h2 className="text-2xl font-bold text-slate-100 mt-2">
            Accountability with real stakes
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>

        <motion.div
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-12 overflow-hidden border-t border-b border-white/5 py-3"
        >
          <div className="marquee-track">
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, idx) => (
              <span
                key={`${item}-${idx}`}
                className="inline-flex items-center gap-2 px-6 text-xs text-slate-400 uppercase tracking-widest whitespace-nowrap"
              >
                <span className="w-1 h-1 rounded-full inline-block bg-indigo-400" />
                {item}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
