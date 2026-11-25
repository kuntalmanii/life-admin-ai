import { useId, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Target,
  Calendar,
  Coins,
  Mail,
  Lock,
  Rocket,
  ChevronRight,
  Sparkles,
  Info,
  AlertCircle,
  Wand2,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { formatUsdEstimate } from "../utils/format";

const PRESETS = ["0.1", "0.5", "1.0", "2.0"];

const FOCUS_RING = {
  goal: "border-indigo-400/50 ring-3 ring-indigo-400/12",
  deadline: "border-sky-300/50 ring-3 ring-sky-300/10",
  stake: "border-teal-400/50 ring-3 ring-teal-400/10",
  email: "border-indigo-300/45 ring-3 ring-indigo-300/10",
};

const BASE_INPUT =
  "w-full bg-white/[0.03] border border-slate-400/15 text-slate-100 placeholder:text-slate-400 outline-none transition-all";

function InputWrapper({ htmlFor, label, icon, children }) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={htmlFor}
        className="text-[11px] font-bold uppercase tracking-widest flex items-center gap-2 text-slate-300"
      >
        <span aria-hidden="true">{icon}</span>
        {label}
      </label>
      {children}
    </div>
  );
}

export default function CommitmentForm({ onCommit, onAnalyzeGoal, loading }) {
  const baseId = useId();
  const goalId = `${baseId}-goal`;
  const deadlineId = `${baseId}-deadline`;
  const stakeId = `${baseId}-stake`;
  const emailId = `${baseId}-email`;
  const errorId = `${baseId}-error`;

  const goalRef = useRef(null);
  const deadlineRef = useRef(null);
  const stakeRef = useRef(null);

  const [goal, setGoal] = useState("");
  const [deadline, setDeadline] = useState("");
  const [stake, setStake] = useState("0.1");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("");
  const [proofCriteria, setProofCriteria] = useState("");
  const [aiPlan, setAiPlan] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [shake, setShake] = useState(false);
  const [focused, setFocused] = useState(null);
  const [errors, setErrors] = useState({});
  const [errorSummary, setErrorSummary] = useState("");

  const usd = formatUsdEstimate(stake, 2);

  const handleAnalyze = async () => {
    if (!goal.trim()) {
      setErrors((prev) => ({ ...prev, goal: true }));
      setErrorSummary("Enter a commitment goal before running AI Coach.");
      goalRef.current?.focus();
      return;
    }
    if (!onAnalyzeGoal) return;

    setErrors((prev) => ({ ...prev, goal: false }));
    setErrorSummary("");
    setAnalyzing(true);
    try {
      const plan = await onAnalyzeGoal({
        goal: goal.trim(),
        deadline,
        stake,
      });
      setAiPlan(plan);
      if (plan?.category) setCategory(plan.category);
      if (plan?.proofCriteria) setProofCriteria(plan.proofCriteria);
    } catch (err) {
      setErrorSummary(err?.message || "AI planning unavailable right now.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApplyPlan = () => {
    if (!aiPlan) return;
    if (aiPlan.refinedGoal) setGoal(aiPlan.refinedGoal);
    if (aiPlan.suggestedStake) setStake(String(aiPlan.suggestedStake));
    if (!deadline && aiPlan.suggestedDeadline) setDeadline(aiPlan.suggestedDeadline);
    if (aiPlan.category) setCategory(aiPlan.category);
    if (aiPlan.proofCriteria) setProofCriteria(aiPlan.proofCriteria);
    setErrors({});
    setErrorSummary("");
  };

  const handleSubmit = (event) => {
    event?.preventDefault?.();

    const nextErrors = {};
    if (!goal.trim()) nextErrors.goal = true;
    if (!deadline) nextErrors.deadline = true;
    const numericStake = parseFloat(stake);
    if (!stake || !Number.isFinite(numericStake) || numericStake <= 0) {
      nextErrors.stake = true;
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      const missing = [];
      if (nextErrors.goal) missing.push("commitment goal");
      if (nextErrors.deadline) missing.push("deadline");
      if (nextErrors.stake) missing.push("positive SOL stake");
      setErrorSummary(`Please enter a valid ${missing.join(", ")}.`);

      setShake(true);
      setTimeout(() => setShake(false), 500);

      if (nextErrors.goal) goalRef.current?.focus();
      else if (nextErrors.deadline) deadlineRef.current?.focus();
      else if (nextErrors.stake) stakeRef.current?.focus();
      return;
    }

    setErrors({});
    setErrorSummary("");
    onCommit({
      goal: goal.trim(),
      deadline,
      stake,
      email: email.trim(),
      ...(category ? { category } : {}),
      ...(proofCriteria ? { proofCriteria } : {}),
    });
  };

  return (
    <motion.div
      animate={shake ? { x: [0, -8, 8, -6, 6, -4, 0] } : { x: 0 }}
      transition={{ duration: 0.4 }}
      className="relative w-full"
    >
      <div
        aria-hidden="true"
        className="absolute -inset-px rounded-3xl opacity-25 pointer-events-none blur-2xl"
        style={{
          background:
            "linear-gradient(135deg, rgba(129, 140, 248, 0.35), rgba(45, 212, 191, 0.15))",
        }}
      />

      <div className="relative rounded-3xl overflow-hidden bg-[#0f1626]/78 backdrop-blur-2xl border border-slate-400/12 shadow-[0_20px_50px_rgba(8,12,22,0.55)]">
        <div
          aria-hidden="true"
          className="h-[2px] w-full opacity-80"
          style={{
            background: "linear-gradient(90deg, #818cf8, #2dd4bf, #818cf8)",
          }}
        />

        <div className="p-7">
          <div className="flex items-start justify-between mb-7">
            <div>
              <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
                New Commitment
                <Sparkles size={16} className="text-indigo-400" aria-hidden="true" />
              </h1>
              <p className="text-slate-300 text-sm mt-1">
                Stake SOL · Miss the deadline · Lose the funds
              </p>
            </div>
            <div className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-indigo-400/12 border border-indigo-400/28 text-indigo-200">
              Step 01
            </div>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {errorSummary && (
              <div
                id={errorId}
                role="alert"
                aria-live="assertive"
                className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs font-semibold bg-rose-400/12 border border-rose-400/30 text-rose-200"
              >
                <AlertCircle size={15} className="shrink-0 text-rose-300" aria-hidden="true" />
                <span>{errorSummary}</span>
              </div>
            )}

            <InputWrapper
              htmlFor={goalId}
              label="I Promise To..."
              icon={<Target size={12} className="text-indigo-400" />}
            >
              <div className="relative">
                <textarea
                  ref={goalRef}
                  id={goalId}
                  value={goal}
                  aria-invalid={Boolean(errors.goal)}
                  aria-describedby={errorSummary ? errorId : undefined}
                  onChange={(e) => {
                    setGoal(e.target.value);
                    if (errors.goal) setErrors((prev) => ({ ...prev, goal: false }));
                  }}
                  onFocus={() => setFocused("goal")}
                  onBlur={() => setFocused(null)}
                  placeholder="e.g. Wake up at 6AM, ship the MVP, run 5km..."
                  className={`${BASE_INPUT} rounded-2xl px-4 py-3.5 text-sm resize-none h-24 ${
                    errors.goal ? "border-rose-400/60" : ""
                  } ${focused === "goal" ? FOCUS_RING.goal : ""}`}
                />
                {goal && (
                  <div
                    aria-hidden="true"
                    className="absolute bottom-3 right-3 text-[10px] font-bold text-indigo-200/80"
                  >
                    {goal.length}
                  </div>
                )}
              </div>

              {onAnalyzeGoal && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleAnalyze}
                    disabled={analyzing || loading}
                    aria-label="Analyze commitment goal with AI Coach"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 bg-indigo-400/12 border border-indigo-400/30 text-indigo-200 hover:bg-indigo-400/20"
                  >
                    {analyzing ? (
                      <>
                        <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                        Analyzing with AI...
                      </>
                    ) : (
                      <>
                        <Wand2 size={12} aria-hidden="true" />
                        AI Coach: Structure Goal
                      </>
                    )}
                  </button>
                </div>
              )}

              {aiPlan && (
                <div
                  role="region"
                  aria-live="polite"
                  aria-label="AI Coach recommendations"
                  className="rounded-2xl p-4 space-y-2.5 bg-indigo-400/[0.07] border border-indigo-400/25"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-200">
                      <Sparkles size={12} aria-hidden="true" />
                      {aiPlan.category}
                    </span>
                    <button
                      type="button"
                      onClick={handleApplyPlan}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer bg-teal-400/15 border border-teal-400/30 text-teal-200 hover:bg-teal-400/25"
                    >
                      <CheckCircle2 size={11} aria-hidden="true" />
                      Apply Suggestions
                    </button>
                  </div>
                  <p className="text-xs text-slate-200">
                    <strong className="text-slate-100">Proof Criteria:</strong>{" "}
                    {aiPlan.proofCriteria}
                  </p>
                  {Array.isArray(aiPlan.checklist) && aiPlan.checklist.length > 0 && (
                    <ul className="text-[11px] text-slate-300 space-y-0.5 list-disc list-inside">
                      {aiPlan.checklist.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ul>
                  )}
                  {aiPlan.riskNote && (
                    <p className="text-[11px] text-indigo-200/90">{aiPlan.riskNote}</p>
                  )}
                </div>
              )}
            </InputWrapper>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputWrapper
                htmlFor={deadlineId}
                label="Deadline"
                icon={<Calendar size={12} className="text-sky-300" />}
              >
                <input
                  ref={deadlineRef}
                  id={deadlineId}
                  type="datetime-local"
                  value={deadline}
                  aria-invalid={Boolean(errors.deadline)}
                  aria-describedby={errorSummary ? errorId : undefined}
                  onChange={(e) => {
                    setDeadline(e.target.value);
                    if (errors.deadline) setErrors((prev) => ({ ...prev, deadline: false }));
                  }}
                  onFocus={() => setFocused("deadline")}
                  onBlur={() => setFocused(null)}
                  className={`${BASE_INPUT} rounded-xl px-4 py-3 text-sm [color-scheme:dark] ${
                    errors.deadline ? "border-rose-400/60" : ""
                  } ${focused === "deadline" ? FOCUS_RING.deadline : ""}`}
                />
              </InputWrapper>

              <InputWrapper
                htmlFor={stakeId}
                label="Stake (SOL)"
                icon={<Coins size={12} className="text-teal-300" />}
              >
                <div className="relative">
                  <span
                    aria-hidden="true"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase text-teal-300"
                  >
                    SOL
                  </span>
                  <input
                    ref={stakeRef}
                    id={stakeId}
                    type="number"
                    step="0.05"
                    min="0.01"
                    value={stake}
                    aria-invalid={Boolean(errors.stake)}
                    aria-describedby={errorSummary ? errorId : undefined}
                    onChange={(e) => {
                      setStake(e.target.value);
                      if (errors.stake) setErrors((prev) => ({ ...prev, stake: false }));
                    }}
                    onFocus={() => setFocused("stake")}
                    onBlur={() => setFocused(null)}
                    className={`${BASE_INPUT} rounded-xl pl-10 pr-3 py-3 text-sm font-mono font-bold ${
                      errors.stake ? "border-rose-400/60" : ""
                    } ${focused === "stake" ? FOCUS_RING.stake : ""}`}
                  />
                </div>
              </InputWrapper>
            </div>

            <div className="flex gap-2" role="group" aria-label="Quick stake presets">
              {PRESETS.map((amt) => {
                const active = stake === amt;
                return (
                  <button
                    key={amt}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setStake(amt);
                      if (errors.stake) setErrors((prev) => ({ ...prev, stake: false }));
                    }}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                      active
                        ? "bg-teal-400/15 border-teal-300/45 text-teal-200"
                        : "bg-white/[0.03] border-slate-400/15 text-slate-300 hover:border-teal-400/25 hover:text-white"
                    }`}
                  >
                    {amt} SOL
                  </button>
                );
              })}
            </div>

            <InputWrapper
              htmlFor={emailId}
              label="Reminder Email (optional)"
              icon={<Mail size={12} className="text-indigo-300" />}
            >
              <input
                id={emailId}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocused("email")}
                onBlur={() => setFocused(null)}
                className={`${BASE_INPUT} rounded-xl px-4 py-3 text-sm ${
                  focused === "email" ? FOCUS_RING.email : ""
                }`}
              />
            </InputWrapper>

            <div className="rounded-2xl p-4 flex items-center justify-between bg-teal-400/[0.05] border border-teal-400/20">
              <div className="flex items-center gap-3">
                <div
                  aria-hidden="true"
                  className="p-2 rounded-xl bg-teal-400/12 border border-teal-400/22"
                >
                  <Lock size={16} className="text-teal-300" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-teal-200">
                    Total Value Locked
                  </p>
                  <p className="text-slate-100 font-bold text-sm">
                    {stake || "0"} SOL{" "}
                    <span className="text-slate-300 font-normal text-xs">
                      (~${usd})
                    </span>
                  </p>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-1 text-[11px] text-teal-200/90">
                <Info size={12} aria-hidden="true" /> Transferred to escrow
              </div>
            </div>

            <motion.button
              type="submit"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.985 }}
              disabled={loading}
              className="relative w-full py-4 rounded-2xl font-bold text-white overflow-hidden text-sm tracking-wide disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-shadow shadow-[0_8px_26px_rgba(99,102,241,0.3)]"
              style={{
                background:
                  "linear-gradient(135deg, #6366f1 0%, #4f46e5 55%, #0d9488 135%)",
              }}
            >
              <div className="relative flex items-center justify-center gap-2">
                <AnimatePresence mode="wait">
                  {loading ? (
                    <motion.span
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2"
                    >
                      <div
                        aria-hidden="true"
                        className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
                      />
                      Processing on-chain...
                    </motion.span>
                  ) : (
                    <motion.span
                      key="idle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2"
                    >
                      <Rocket size={16} aria-hidden="true" />
                      Lock Funds & Commit
                      <ChevronRight size={15} className="opacity-75" aria-hidden="true" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </motion.button>

            <p className="text-center text-[11px] text-slate-400 leading-relaxed">
              By committing, SOL transfers to escrow. Funds are refunded only
              upon proof approval.
            </p>
          </form>
        </div>
      </div>
    </motion.div>
  );
}
