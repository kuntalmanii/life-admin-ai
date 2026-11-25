import { IPFS_GATEWAY, SOL_PRICE_USD } from "../config";

const DEFAULT_DURATION_MS = 7 * 86400000;

export function resolveIpfsUrl(uri) {
  if (!uri) return "";
  return uri.replace("ipfs://", IPFS_GATEWAY);
}

export function formatUsdEstimate(solAmount, decimals = 2) {
  const numeric = parseFloat(solAmount || 0);
  return (Number.isFinite(numeric) ? numeric * SOL_PRICE_USD : 0).toFixed(decimals);
}

export function isCommitmentActive(status) {
  return (
    status === "PENDING" ||
    status === "ON_CHAIN_ONLY" ||
    status === "PROOF_SUBMITTED"
  );
}

export function isCommitmentExpired(deadline, nowMs = Date.now()) {
  if (!deadline) return false;
  return new Date(deadline).getTime() < nowMs;
}

/**
 * Computes elapsed percentage between createdAt (or fallback 7-day window) and deadline.
 */
export function computeElapsedPercent(createdAt, deadline, nowMs = Date.now()) {
  if (!deadline) return 0;
  const endMs = new Date(deadline).getTime();
  if (Number.isNaN(endMs)) return 0;

  const startMs = createdAt
    ? new Date(createdAt).getTime()
    : endMs - DEFAULT_DURATION_MS;

  const total = Math.max(endMs - startMs, 1);
  const elapsed = nowMs - startMs;
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

/**
 * Sorts active commitments first (soonest deadline at top),
 * followed by resolved commitments (most recent deadline first).
 */
export function sortCommitments(items) {
  return [...items].sort((a, b) => {
    const aActive = isCommitmentActive(a.status);
    const bActive = isCommitmentActive(b.status);

    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;

    const aTime = new Date(a.deadline || 0).getTime();
    const bTime = new Date(b.deadline || 0).getTime();
    return aActive ? aTime - bTime : bTime - aTime;
  });
}
