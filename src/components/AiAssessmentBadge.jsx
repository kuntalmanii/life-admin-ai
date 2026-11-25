import { Sparkles, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

const VERDICT_CONFIG = {
  LIKELY_VALID: {
    label: "AI: Likely Valid",
    bg: "bg-teal-400/12",
    border: "border-teal-400/30",
    text: "text-teal-200",
    icon: CheckCircle2,
  },
  NEEDS_REVIEW: {
    label: "AI: Needs Review",
    bg: "bg-amber-400/12",
    border: "border-amber-400/30",
    text: "text-amber-200",
    icon: AlertTriangle,
  },
  INSUFFICIENT: {
    label: "AI: Insufficient",
    bg: "bg-rose-400/12",
    border: "border-rose-400/30",
    text: "text-rose-200",
    icon: XCircle,
  },
};

/**
 * Renders the Life Admin AI Proof Copilot verdict, confidence percentage, and evidence breakdown.
 */
export default function AiAssessmentBadge({ assessment, compact = false }) {
  if (!assessment || !assessment.verdict) return null;

  const cfg = VERDICT_CONFIG[assessment.verdict] || VERDICT_CONFIG.NEEDS_REVIEW;
  const Icon = cfg.icon;
  const confidence = Number.isFinite(Number(assessment.confidence))
    ? Math.round(Number(assessment.confidence))
    : 0;

  if (compact) {
    return (
      <div
        className={`mt-2.5 rounded-xl px-3 py-2 text-xs flex items-center justify-between gap-2 border ${cfg.bg} ${cfg.border} ${cfg.text}`}
      >
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <Icon size={13} aria-hidden="true" />
          {cfg.label}
        </span>
        <span className="font-mono font-bold">{confidence}% confidence</span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl p-4 border space-y-2.5 ${cfg.bg} ${cfg.border}`}
      aria-label="AI proof evaluation summary"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${cfg.text}`}>
          <Icon size={14} aria-hidden="true" />
          {cfg.label}
        </span>
        <div className="flex items-center gap-2 text-xs">
          <span className={`font-mono font-bold ${cfg.text}`}>
            {confidence}% confidence
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/[0.06] text-slate-200">
            <Sparkles size={10} aria-hidden="true" />
            {assessment.provider === "gemini" ? "Gemini AI" : "AI Rubric"}
          </span>
        </div>
      </div>

      {assessment.summary && (
        <p className="text-xs text-slate-200 leading-relaxed">{assessment.summary}</p>
      )}

      {Array.isArray(assessment.matchedCriteria) &&
        assessment.matchedCriteria.length > 0 && (
          <ul className="text-[11px] text-teal-200/95 space-y-0.5 list-disc list-inside">
            {assessment.matchedCriteria.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}

      {Array.isArray(assessment.redFlags) && assessment.redFlags.length > 0 && (
        <ul className="text-[11px] text-amber-200/95 space-y-0.5 list-disc list-inside">
          {assessment.redFlags.map((flag) => (
            <li key={flag}>{flag}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
