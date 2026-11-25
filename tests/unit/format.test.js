import { describe, expect, it } from "vitest";
import {
  computeElapsedPercent,
  formatUsdEstimate,
  isCommitmentActive,
  isCommitmentExpired,
  resolveIpfsUrl,
  sortCommitments,
} from "../../src/utils/format";

describe("format utilities", () => {
  describe("isCommitmentExpired", () => {
    const nowMs = Date.parse("2026-11-25T12:00:00.000Z");

    it("returns false when deadline is missing or in the future", () => {
      expect(isCommitmentExpired(null, nowMs)).toBe(false);
      expect(isCommitmentExpired("", nowMs)).toBe(false);
      expect(isCommitmentExpired("2026-11-25T12:05:00.000Z", nowMs)).toBe(false);
    });

    it("returns true when deadline is in the past", () => {
      expect(isCommitmentExpired("2026-11-25T11:59:59.000Z", nowMs)).toBe(true);
    });
  });

  describe("computeElapsedPercent", () => {
    it("returns 0 when deadline is missing or invalid", () => {
      expect(computeElapsedPercent("2026-11-20T00:00:00Z", null)).toBe(0);
      expect(computeElapsedPercent("2026-11-20T00:00:00Z", "invalid-date")).toBe(0);
    });

    it("computes exact percentage between createdAt and deadline", () => {
      const createdAt = "2026-11-25T00:00:00.000Z";
      const deadline = "2026-11-25T10:00:00.000Z";
      const halfwayMs = Date.parse("2026-11-25T05:00:00.000Z");
      const overMs = Date.parse("2026-11-25T12:00:00.000Z");
      const beforeMs = Date.parse("2026-11-24T22:00:00.000Z");

      expect(computeElapsedPercent(createdAt, deadline, halfwayMs)).toBe(50);
      expect(computeElapsedPercent(createdAt, deadline, overMs)).toBe(100);
      expect(computeElapsedPercent(createdAt, deadline, beforeMs)).toBe(0);
    });

    it("falls back to a 7-day window when createdAt is omitted", () => {
      const deadline = "2026-11-25T00:00:00.000Z";
      const threeAndHalfDaysBefore = Date.parse("2026-11-21T12:00:00.000Z");
      expect(computeElapsedPercent(null, deadline, threeAndHalfDaysBefore)).toBe(50);
    });
  });

  describe("sortCommitments", () => {
    it("places active commitments first by soonest deadline, then resolved by most recent deadline", () => {
      const input = [
        { mint: "done-old", status: "COMPLETED", deadline: "2026-11-01T10:00:00Z" },
        { mint: "pending-later", status: "PENDING", deadline: "2026-11-30T10:00:00Z" },
        { mint: "failed-recent", status: "FAILED", deadline: "2026-11-20T10:00:00Z" },
        { mint: "review-soon", status: "PROOF_SUBMITTED", deadline: "2026-11-26T10:00:00Z" },
        { mint: "onchain-soonest", status: "ON_CHAIN_ONLY", deadline: "2026-11-25T15:00:00Z" },
      ];

      const sorted = sortCommitments(input);
      expect(sorted.map((x) => x.mint)).toEqual([
        "onchain-soonest",
        "review-soon",
        "pending-later",
        "failed-recent",
        "done-old",
      ]);
      // Does not mutate original array
      expect(input[0].mint).toBe("done-old");
    });
  });

  describe("helpers", () => {
    it("identifies active statuses, formats USD, and resolves IPFS URIs", () => {
      expect(isCommitmentActive("PENDING")).toBe(true);
      expect(isCommitmentActive("ON_CHAIN_ONLY")).toBe(true);
      expect(isCommitmentActive("PROOF_SUBMITTED")).toBe(true);
      expect(isCommitmentActive("COMPLETED")).toBe(false);
      expect(isCommitmentActive("FAILED")).toBe(false);

      expect(formatUsdEstimate("0.5", 2)).toBe("75.00");
      expect(formatUsdEstimate("", 0)).toBe("0");
      expect(resolveIpfsUrl("ipfs://QmHash123")).toBe(
        "https://ipfs.io/ipfs/QmHash123"
      );
    });
  });
});
