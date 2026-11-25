// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { Keypair } from "@solana/web3.js";
import { planCommitmentWithAI, verifyProofWithAI } from "../../backend/ai.js";
import { createApp } from "../../backend/app.js";
import { closeDB, readDB } from "../../backend/db.js";

const ED25519_PKCS8_PREFIX = Buffer.from(
  "302e020100300506032b657004220420",
  "hex"
);

async function authenticateWallet(app, keypair) {
  const wallet = keypair.publicKey.toBase58();
  const ch = await request(app).post("/api/auth/challenge").send({ wallet });
  const privateKey = crypto.createPrivateKey({
    key: Buffer.concat([
      ED25519_PKCS8_PREFIX,
      Buffer.from(keypair.secretKey.slice(0, 32)),
    ]),
    format: "der",
    type: "pkcs8",
  });
  const sig = crypto
    .sign(null, Buffer.from(ch.body.message, "utf8"), privateKey)
    .toString("base64");
  const vr = await request(app)
    .post("/api/auth/verify")
    .send({ wallet, nonce: ch.body.nonce, signature: sig });
  return vr.body.token;
}

describe("Life Admin AI Engine (Coach & Proof Copilot)", () => {
  it("classifies goals, produces verifiable proof criteria locally, and uses Gemini JSON when configured", async () => {
    const localPlan = await planCommitmentWithAI(
      { goal: "pay electricity bill before cutoff", deadline: "", stake: "" },
      { apiKey: "" }
    );
    expect(localPlan.provider).toBe("local-heuristic");
    expect(localPlan.category).toBe("Finance & Bills");
    expect(localPlan.proofCriteria).toMatch(/receipt|confirmation/i);
    expect(localPlan.checklist.length).toBeGreaterThanOrEqual(2);

    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    category: "Engineering & Delivery",
                    refinedGoal: "Ship v2 authentication release",
                    proofCriteria: "Merged GitHub PR link and green CI output",
                    checklist: ["Run Vitest suite", "Merge release PR"],
                    suggestedStake: "0.75",
                    riskNote: "Ensure CI link is public.",
                  }),
                },
              ],
            },
          },
        ],
      }),
    }));

    const geminiPlan = await planCommitmentWithAI(
      { goal: "ship auth update" },
      { apiKey: "fake-gemini-key", fetchFn: mockFetch }
    );
    expect(geminiPlan.provider).toBe("gemini");
    expect(geminiPlan.refinedGoal).toBe("Ship v2 authentication release");
    expect(geminiPlan.suggestedStake).toBe("0.75");
  });

  it("distinguishes strong verifiable proofs from vague claims cleanly", async () => {
    const strong = await verifyProofWithAI(
      {
        goal: "Ship GitHub release PR",
        proofCriteria: "Public GitHub PR link and test run summary",
        proofDescription:
          "Merged PR #42 at https://github.com/example/repo/pull/42 with all 27 automated tests passing.",
        renewalDate: "2030-01-01T10:00:00.000Z",
        submittedAt: "2029-12-31T10:00:00.000Z",
      },
      { apiKey: "" }
    );
    expect(strong.verdict).toBe("LIKELY_VALID");
    expect(strong.confidence).toBeGreaterThanOrEqual(72);

    const weak = await verifyProofWithAI(
      {
        goal: "Pay quarterly tax filing",
        proofCriteria: "Tax portal confirmation receipt ID",
        proofDescription: "done",
        renewalDate: "2025-01-01T10:00:00.000Z",
        submittedAt: "2025-01-02T10:00:00.000Z",
      },
      { apiKey: "" }
    );
    expect(weak.verdict).toBe("INSUFFICIENT");
    expect(weak.redFlags.length).toBeGreaterThan(0);
  });
});

describe("AI API Endpoints & Proof Auto-Audit Integration", () => {
  let tmpDir;
  let sqlitePath;
  let userKp;
  let otherKp;
  let verifierKp;
  let verifierWallet;
  let app;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scap-ai-api-"));
    sqlitePath = path.join(tmpDir, "db.sqlite");
    userKp = Keypair.generate();
    otherKp = Keypair.generate();
    verifierKp = Keypair.generate();
    verifierWallet = verifierKp.publicKey.toBase58();

    app = createApp({
      dbPath: sqlitePath,
      verifierWallet,
      verifySolTransferFn: vi.fn(async () => ({ valid: true })),
      verifyNftOwnershipFn: vi.fn(async () => ({ valid: true })),
      sendEmailFn: vi.fn(async () => ({ messageId: "ok" })),
      suppressWarnings: true,
    });
  });

  afterEach(() => {
    closeDB(sqlitePath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("plans commitments, auto-audits proof submissions, and restricts /api/ai/verify-proof to owner/verifier", async () => {
    const userToken = await authenticateWallet(app, userKp);
    const otherToken = await authenticateWallet(app, otherKp);
    const verifierToken = await authenticateWallet(app, verifierKp);
    const mint = Keypair.generate().publicKey.toBase58();

    const planRes = await request(app)
      .post("/api/ai/plan")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ goal: "renew passport appointment", stake: "0.5" });
    expect(planRes.status).toBe(200);
    expect(planRes.body.category).toBe("Legal & Documents");

    await request(app)
      .post("/api/track")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        mintAddress: mint,
        stakeSignature: "SigAiTrack1111111111111111111111111111111111",
        metadataUri: "ipfs://QmAiTrack",
        service: "Renew passport appointment",
        category: planRes.body.category,
        proofCriteria: planRes.body.proofCriteria,
        renewalDate: "2030-06-01T10:00",
        verifier: verifierWallet,
        stakeAmount: 0.5,
      });

    const proofRes = await request(app)
      .post("/api/proof")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        mintAddress: mint,
        proofCid: "ipfs://QmProofAi",
        proofDescription:
          "Submitted passport renewal application #REF-99182 at https://passport.example.gov/status",
      });
    expect(proofRes.status).toBe(200);
    expect(proofRes.body.aiAssessment?.verdict).toBe("LIKELY_VALID");

    const forbiddenAudit = await request(app)
      .post("/api/ai/verify-proof")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ mintAddress: mint, proofDescription: "spoof" });
    expect(forbiddenAudit.status).toBe(403);

    const verifierAudit = await request(app)
      .post("/api/ai/verify-proof")
      .set("Authorization", `Bearer ${verifierToken}`)
      .send({
        mintAddress: mint,
        proofDescription: "done",
      });
    expect(verifierAudit.status).toBe(200);
    expect(verifierAudit.body.assessment.verdict).toBe("INSUFFICIENT");

    const stored = readDB(sqlitePath).find((x) => x.mintAddress === mint);
    expect(stored.aiAssessment.verdict).toBe("INSUFFICIENT");
  });
});
