import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { motion } from "framer-motion";
import { BrainCircuit, Sparkles, Github, Twitter, ExternalLink } from "lucide-react";

const scrollTo = (id) => {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
};

const NAV_LINKS = [
  {
    label: "Commitments",
    action: () => scrollTo("commitments"),
    external: false,
  },
  {
    label: "Verify",
    action: () => scrollTo("verify"),
    external: false,
  },
  {
    label: "Docs",
    action: () => window.open("https://github.com/", "_blank", "noopener,noreferrer"),
    external: true,
  },
];

export default function Header() {
  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="sticky top-0 z-50 px-6 py-3.5 mb-8"
    >
      <div
        className="absolute inset-0 backdrop-blur-2xl"
        style={{ background: "rgba(8, 12, 22, 0.78)" }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(129, 140, 248, 0.28), rgba(45, 212, 191, 0.18), transparent)",
        }}
      />

      <div className="relative max-w-7xl mx-auto flex items-center justify-between">
        <button
          type="button"
          aria-label="Life Admin AI — scroll to top"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="flex items-center gap-3 group cursor-pointer"
        >
          <div className="relative" aria-hidden="true">
            <div
              className="absolute inset-0 rounded-xl opacity-40 group-hover:opacity-70 transition-opacity"
              style={{
                background: "linear-gradient(135deg, #818cf8, #2dd4bf)",
                filter: "blur(10px)",
              }}
            />
            <div
              className="relative p-2.5 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105"
              style={{
                background: "linear-gradient(135deg, #6366f1, #4f46e5)",
                border: "1px solid rgba(165, 180, 252, 0.25)",
              }}
            >
              <BrainCircuit className="text-white w-5 h-5" />
            </div>
          </div>

          <div className="flex flex-col leading-none text-left">
            <span
              className="text-lg font-bold text-slate-100 tracking-tight"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Life Admin<span style={{ color: "#818cf8" }}> AI</span>
            </span>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] flex items-center gap-1 mt-0.5">
              Protocol v1 <Sparkles size={7} style={{ color: "#2dd4bf" }} aria-hidden="true" />
            </span>
          </div>
        </button>

        <nav aria-label="Main navigation" className="hidden lg:flex items-center gap-1">
          {NAV_LINKS.map(({ label, action, external }) => (
            <button
              key={label}
              type="button"
              onClick={action}
              className="relative flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-slate-300 transition-all duration-200 group hover:text-white hover:bg-indigo-400/10 cursor-pointer"
            >
              {label}
              {external && (
                <ExternalLink
                  size={11}
                  aria-hidden="true"
                  className="opacity-65 group-hover:opacity-100 transition-opacity"
                />
              )}
              <span
                aria-hidden="true"
                className="absolute bottom-1 left-4 right-4 h-px rounded-full scale-x-0 group-hover:scale-x-100 transition-transform duration-200 origin-left"
                style={{ background: "linear-gradient(90deg, #818cf8, #2dd4bf)" }}
              />
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex badge-live">
            <span className="dot" aria-hidden="true" />
            Testnet Live
          </div>

          <div className="hidden md:flex items-center gap-1">
            <a
              href="https://github.com/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Life Admin AI on GitHub"
              title="GitHub"
              className="p-2 rounded-xl text-slate-400 hover:text-indigo-200 hover:bg-indigo-400/10 transition-all duration-200"
            >
              <Github size={16} aria-hidden="true" />
            </a>
            <a
              href="https://twitter.com/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Life Admin AI on Twitter"
              title="Twitter / X"
              className="p-2 rounded-xl text-slate-400 hover:text-indigo-200 hover:bg-indigo-400/10 transition-all duration-200"
            >
              <Twitter size={16} aria-hidden="true" />
            </a>
          </div>

          <WalletMultiButton />
        </div>
      </div>
    </motion.header>
  );
}
