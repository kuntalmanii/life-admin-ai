import { GEMINI_API_KEY, GEMINI_MODEL } from "./config.js";

const VALID_VERDICTS = new Set(["LIKELY_VALID", "NEEDS_REVIEW", "INSUFFICIENT"]);

const DOMAIN_RULES = [
  {
    category: "Finance & Bills",
    keywords: [
      "bill",
      "tax",
      "invoice",
      "rent",
      "electricity",
      "water",
      "insurance",
      "bank",
      "credit",
      "payment",
      "subscription",
      "cancel",
      "utility",
    ],
    suggestedStake: "0.5",
    proofCriteria:
      "Payment confirmation ID, cancellation email reference, or zero-balance receipt link.",
    checklist: [
      "Complete the payment or cancellation workflow",
      "Save confirmation receipt ID or screenshot URL",
    ],
  },
  {
    category: "Legal & Documents",
    keywords: [
      "passport",
      "visa",
      "license",
      "contract",
      "permit",
      "registration",
      "dmv",
      "filing",
      "certificate",
      "form",
      "kyc",
    ],
    suggestedStake: "1.0",
    proofCriteria:
      "Submitted application receipt number, portal confirmation URL, or stamped document summary.",
    checklist: [
      "Gather required supporting documents",
      "Submit application before cutoff and record reference ID",
    ],
  },
  {
    category: "Health & Fitness",
    keywords: [
      "run",
      "gym",
      "workout",
      "doctor",
      "dentist",
      "checkup",
      "appointment",
      "walk",
      "steps",
      "km",
      "mile",
      "meditate",
    ],
    suggestedStake: "0.25",
    proofCriteria:
      "Activity tracker link (e.g., Strava/Garmin), check-in confirmation, or completion log.",
    checklist: [
      "Complete the scheduled session or appointment",
      "Capture public activity URL or visit confirmation",
    ],
  },
  {
    category: "Engineering & Delivery",
    keywords: [
      "ship",
      "deploy",
      "mvp",
      "pr",
      "repo",
      "commit",
      "build",
      "test",
      "audit",
      "bug",
      "release",
      "github",
    ],
    suggestedStake: "0.5",
    proofCriteria:
      "Public GitHub PR/commit URL, deployed preview link, or passing test run output.",
    checklist: [
      "Verify build and automated test suite pass",
      "Attach commit, PR, or live deployment URL as proof",
    ],
  },
  {
    category: "Study & Career",
    keywords: [
      "study",
      "resume",
      "apply",
      "interview",
      "course",
      "exam",
      "homework",
      "assignment",
      "read",
      "portfolio",
      "certification",
    ],
    suggestedStake: "0.25",
    proofCriteria:
      "Submission receipt link, published portfolio URL, or completed module summary.",
    checklist: [
      "Finish core deliverable without distractions",
      "Link submission receipt or published artifact",
    ],
  },
];

const DEFAULT_DOMAIN = {
  category: "Life Admin",
  suggestedStake: "0.1",
  proofCriteria:
    "Verifiable confirmation ID, URL reference, or timestamped completion summary.",
  checklist: [
    "Break task into one verifiable milestone",
    "Record concrete evidence immediately on completion",
  ],
};

const STOP_WORDS = new Set([
  "with",
  "from",
  "this",
  "that",
  "your",
  "have",
  "will",
  "before",
  "after",
  "into",
  "task",
  "goal",
  "done",
  "completed",
]);

const GENERIC_SPAM_RE = /^(done|completed|finished|ok|yes|asdf|test|trust me|n\/a)[.!\s]*$/i;
const EVIDENCE_URL_RE = /(https?:\/\/\S+|ipfs:\/\/\S+)/i;
const EVIDENCE_ID_RE =
  /(#[0-9]+|\b(?:ref|tx|id|invoice|receipt|order|pr|ticket)[:#\s-]*[a-z0-9-]{4,}\b)/i;

const cleanText = (value, maxLen = 500) =>
  typeof value === "string" ? value.trim().slice(0, maxLen) : "";

const clampConfidence = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 50;
  return Math.max(0, Math.min(100, Math.round(num)));
};

function tokenize(text) {
  return cleanText(text, 1000)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
}

function defaultSuggestedDeadline() {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  tomorrow.setMinutes(0, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(
    tomorrow.getDate()
  )}T${pad(tomorrow.getHours())}:00`;
}

/**
 * Classifies a natural-language commitment into a structured Life Admin domain.
 */
export function classifyLifeAdminDomain(goal) {
  const normalized = cleanText(goal).toLowerCase();
  for (const rule of DOMAIN_RULES) {
    if (rule.keywords.some((kw) => normalized.includes(kw))) {
      return rule;
    }
  }
  return DEFAULT_DOMAIN;
}

/**
 * Invokes Google Gemini generateContent with strict JSON parsing and timeout safety.
 */
async function callGeminiJson({
  prompt,
  apiKey = GEMINI_API_KEY,
  model = GEMINI_MODEL,
  fetchFn = fetch,
  timeoutMs = 12_000,
}) {
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent`;
    const res = await fetchFn(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Gemini HTTP ${res.status}`);
    }

    const payload = await res.json();
    const rawText =
      payload?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    return cleaned ? JSON.parse(cleaned) : null;
  } catch (err) {
    console.warn("Gemini AI call fell back to local engine:", err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function buildFallbackPlan({ goal, deadline, stake }) {
  const domain = classifyLifeAdminDomain(goal);
  const rawGoal = cleanText(goal, 300);
  const refinedGoal = rawGoal.charAt(0).toUpperCase() + rawGoal.slice(1);
  const numericStake = Number(stake);
  const suggestedStake =
    Number.isFinite(numericStake) && numericStake > 0
      ? String(stake)
      : domain.suggestedStake;

  return {
    category: domain.category,
    refinedGoal,
    proofCriteria: domain.proofCriteria,
    checklist: domain.checklist,
    suggestedStake,
    suggestedDeadline: cleanText(deadline, 64) || defaultSuggestedDeadline(),
    riskNote:
      refinedGoal.length < 12
        ? "Goal is brief—add a specific outcome or measurable target so verification is unambiguous."
        : "Clear commitment. Include concrete proof before the deadline to unlock your SOL refund.",
    provider: "local-heuristic",
  };
}

/**
 * Structures a raw life-admin task into a verifiable commitment plan via Gemini or local fallback.
 */
export async function planCommitmentWithAI(
  { goal, deadline = "", stake = "" },
  deps = {}
) {
  const cleanGoal = cleanText(goal, 500);
  if (!cleanGoal) {
    throw new Error("Commitment goal is required for AI planning");
  }

  const fallback = buildFallbackPlan({
    goal: cleanGoal,
    deadline,
    stake,
  });

  const prompt = [
    "You are the Life Admin AI Coach for a Solana accountability dApp.",
    "Turn the user's goal into an unambiguous, verifiable commitment plan.",
    "Return JSON only with keys:",
    "category (string), refinedGoal (concise string <= 120 chars), proofCriteria (string <= 200 chars), checklist (array of 2-3 short strings), suggestedStake (numeric SOL string like '0.25' or '0.5'), riskNote (short string).",
    `Goal: ${JSON.stringify(cleanGoal)}`,
    `Current deadline input: ${JSON.stringify(cleanText(deadline, 64) || "not set")}`,
    `Current stake input: ${JSON.stringify(cleanText(String(stake || ""), 16) || "0.1")}`,
  ].join("\n");

  const ai = await callGeminiJson({
    prompt,
    apiKey: deps.apiKey ?? GEMINI_API_KEY,
    model: deps.model ?? GEMINI_MODEL,
    fetchFn: deps.fetchFn ?? fetch,
  });

  if (!ai || typeof ai !== "object") {
    return fallback;
  }

  const parsedStake = Number(ai.suggestedStake);
  return {
    category: cleanText(ai.category, 48) || fallback.category,
    refinedGoal: cleanText(ai.refinedGoal, 160) || fallback.refinedGoal,
    proofCriteria: cleanText(ai.proofCriteria, 260) || fallback.proofCriteria,
    checklist:
      Array.isArray(ai.checklist) && ai.checklist.length > 0
        ? ai.checklist
            .map((step) => cleanText(step, 120))
            .filter(Boolean)
            .slice(0, 4)
        : fallback.checklist,
    suggestedStake:
      Number.isFinite(parsedStake) && parsedStake >= 0.01 && parsedStake <= 10
        ? String(parsedStake)
        : fallback.suggestedStake,
    suggestedDeadline: fallback.suggestedDeadline,
    riskNote: cleanText(ai.riskNote, 200) || fallback.riskNote,
    provider: "gemini",
  };
}

function buildFallbackProofAssessment({
  goal,
  proofCriteria,
  proofDescription,
  renewalDate,
  submittedAt,
}) {
  const proof = cleanText(proofDescription, 1000);
  const matchedCriteria = [];
  const redFlags = [];
  let score = 20;

  if (!proof || GENERIC_SPAM_RE.test(proof) || proof.length < 12) {
    redFlags.push("Proof is too generic or lacks verifiable detail.");
    score -= 10;
  } else if (proof.length >= 25) {
    matchedCriteria.push("Provides detailed completion narrative");
    score += 20;
  } else {
    score += 10;
  }

  if (EVIDENCE_URL_RE.test(proof)) {
    matchedCriteria.push("Includes verifiable URL or IPFS evidence link");
    score += 28;
  } else {
    redFlags.push("No URL link attached (receipt, PR, or tracker link helps verify).");
  }

  if (EVIDENCE_ID_RE.test(proof)) {
    matchedCriteria.push("References confirmation, ticket, or transaction ID");
    score += 18;
  }

  const goalTokens = new Set([
    ...tokenize(goal),
    ...tokenize(proofCriteria),
  ]);
  const proofTokens = new Set(tokenize(proof));
  let overlap = 0;
  for (const token of proofTokens) {
    if (goalTokens.has(token)) overlap++;
  }

  if (overlap >= 2) {
    matchedCriteria.push("Strong contextual match with commitment objective");
    score += 18;
  } else if (overlap === 1) {
    matchedCriteria.push("Partial keyword match with commitment goal");
    score += 10;
  } else if (goalTokens.size > 0) {
    redFlags.push("Minimal contextual overlap with the stated commitment goal.");
  }

  const deadlineMs = renewalDate ? new Date(renewalDate).getTime() : NaN;
  const submittedMs = submittedAt ? new Date(submittedAt).getTime() : Date.now();
  if (Number.isFinite(deadlineMs) && Number.isFinite(submittedMs)) {
    if (submittedMs <= deadlineMs) {
      matchedCriteria.push("Submitted before commitment deadline");
      score += 12;
    } else {
      redFlags.push("Submitted after the commitment deadline.");
      score -= 20;
    }
  }

  const confidence = clampConfidence(score);
  const verdict =
    confidence >= 72
      ? "LIKELY_VALID"
      : confidence >= 42
      ? "NEEDS_REVIEW"
      : "INSUFFICIENT";

  const summary =
    verdict === "LIKELY_VALID"
      ? "Evidence aligns well with the commitment goal and includes concrete proof."
      : verdict === "NEEDS_REVIEW"
      ? "Partial completion evidence detected; human verifier should double-check details."
      : "Submitted proof lacks specific, verifiable evidence supporting completion.";

  return {
    verdict,
    confidence,
    summary,
    matchedCriteria,
    redFlags,
    analyzedAt: new Date().toISOString(),
    provider: "local-heuristic",
  };
}

/**
 * Evaluates submitted commitment proof against the stated goal & criteria via Gemini or local fallback.
 */
export async function verifyProofWithAI(
  {
    goal = "",
    proofCriteria = "",
    proofDescription = "",
    renewalDate = "",
    submittedAt = "",
  },
  deps = {}
) {
  const cleanProof = cleanText(proofDescription, 1000);
  if (!cleanProof) {
    throw new Error("Proof description is required for AI verification");
  }

  const fallback = buildFallbackProofAssessment({
    goal,
    proofCriteria,
    proofDescription: cleanProof,
    renewalDate,
    submittedAt,
  });

  const prompt = [
    "You are the Life Admin AI Proof Verification Copilot.",
    "Compare the commitment goal and expected proof criteria against the user's submitted proof.",
    "Return JSON only with keys:",
    "verdict ('LIKELY_VALID' | 'NEEDS_REVIEW' | 'INSUFFICIENT'), confidence (integer 0-100), summary (string <= 200 chars), matchedCriteria (array of short strings), redFlags (array of short strings).",
    `Goal: ${JSON.stringify(cleanText(goal, 300))}`,
    `Expected proof criteria: ${JSON.stringify(cleanText(proofCriteria, 300) || "General completion proof")}`,
    `Deadline: ${JSON.stringify(cleanText(renewalDate, 64))}`,
    `Submitted at: ${JSON.stringify(cleanText(submittedAt, 64) || new Date().toISOString())}`,
    `Submitted proof: ${JSON.stringify(cleanProof)}`,
  ].join("\n");

  const ai = await callGeminiJson({
    prompt,
    apiKey: deps.apiKey ?? GEMINI_API_KEY,
    model: deps.model ?? GEMINI_MODEL,
    fetchFn: deps.fetchFn ?? fetch,
  });

  if (!ai || typeof ai !== "object") {
    return fallback;
  }

  const normalizedVerdict = cleanText(ai.verdict, 32).toUpperCase();
  return {
    verdict: VALID_VERDICTS.has(normalizedVerdict)
      ? normalizedVerdict
      : fallback.verdict,
    confidence:
      ai.confidence !== undefined
        ? clampConfidence(ai.confidence)
        : fallback.confidence,
    summary: cleanText(ai.summary, 240) || fallback.summary,
    matchedCriteria: Array.isArray(ai.matchedCriteria)
      ? ai.matchedCriteria.map((c) => cleanText(c, 120)).filter(Boolean).slice(0, 5)
      : fallback.matchedCriteria,
    redFlags: Array.isArray(ai.redFlags)
      ? ai.redFlags.map((c) => cleanText(c, 120)).filter(Boolean).slice(0, 5)
      : fallback.redFlags,
    analyzedAt: new Date().toISOString(),
    provider: "gemini",
  };
}
