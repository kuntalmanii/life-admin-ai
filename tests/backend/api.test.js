// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import nacl from "tweetnacl";
import { Keypair } from "@solana/web3.js";
import { createApp } from "../../backend/app.js";

async function authenticateWallet(app, keypair) {
  const wallet = keypair.publicKey.toBase58();
  const ch = await request(app).post("/api/auth/challenge").send({ wallet });
  expect(ch.status).toBe(200);

  const sig = Buffer.from(
    nacl.sign.detached(new TextEncoder().encode(ch.body.message), keypair.secretKey)
  ).toString("base64");

  const vr = await request(app)
    .post("/api/auth/verify")
    .send({ wallet, nonce: ch.body.nonce, signature: sig });
  expect(vr.status).toBe(200);
  return vr.body.token;
}

describe("Backend API Integration", () => {
  let tmpDir;
  let dbPath;
  let userKp;
  let otherKp;
  let verifierKp;
  let verifierWallet;
  let verifySolTransferFn;
  let verifyNftOwnershipFn;
  let sendEmailFn;
  let app;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scap-api-test-"));
    dbPath = path.join(tmpDir, "db.json");
    fs.writeFileSync(dbPath, JSON.stringify([]));

    userKp = Keypair.generate();
    otherKp = Keypair.generate();
    verifierKp = Keypair.generate();
    verifierWallet = verifierKp.publicKey.toBase58();

    verifySolTransferFn = vi.fn(async () => ({ valid: true }));
    verifyNftOwnershipFn = vi.fn(async () => ({ valid: true }));
    sendEmailFn = vi.fn(async () => ({ messageId: "test-msg" }));

    app = createApp({
      dbPath,
      verifierWallet,
      verifySolTransferFn,
      verifyNftOwnershipFn,
      sendEmailFn,
      suppressWarnings: true,
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("tracks commitment, protects against stakeSignature replay, and scopes GET /api/commitments", async () => {
    const userToken = await authenticateWallet(app, userKp);
    const otherToken = await authenticateWallet(app, otherKp);
    const mint = Keypair.generate().publicKey.toBase58();

    const trackRes = await request(app)
      .post("/api/track")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        mintAddress: mint,
        stakeSignature: "SigStake11111111111111111111111111111111111111",
        owner: userKp.publicKey.toBase58(),
        email: "runner@example.com",
        metadataUri: "ipfs://QmCommitMeta",
        service: "Run 5km",
        renewalDate: "2030-01-01T10:00",
        verifier: verifierWallet,
        stakeAmount: 0.5,
      });

    expect(trackRes.status).toBe(200);
    expect(trackRes.body.success).toBe(true);
    expect(verifySolTransferFn).toHaveBeenCalledTimes(1);
    expect(sendEmailFn).toHaveBeenCalledTimes(1);

    // Scoped commitments: owner sees their item, other user sees []
    const ownList = await request(app)
      .get("/api/commitments")
      .set("Authorization", `Bearer ${userToken}`);
    expect(ownList.status).toBe(200);
    expect(ownList.body).toHaveLength(1);
    expect(ownList.body[0].mintAddress).toBe(mint);

    const otherList = await request(app)
      .get("/api/commitments")
      .set("Authorization", `Bearer ${otherToken}`);
    expect(otherList.status).toBe(200);
    expect(otherList.body).toEqual([]);

    // Reusing same stakeSignature for a new mint returns 409
    const mint2 = Keypair.generate().publicKey.toBase58();
    const replayRes = await request(app)
      .post("/api/track")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        mintAddress: mint2,
        stakeSignature: "SigStake11111111111111111111111111111111111111",
        owner: userKp.publicKey.toBase58(),
        metadataUri: "ipfs://QmCommitMeta2",
        service: "Duplicate stake attempt",
        renewalDate: "2030-01-01T10:00",
        verifier: verifierWallet,
        stakeAmount: 0.5,
      });
    expect(replayRes.status).toBe(409);
  });

  it("handles POST /api/proof recovery when on-chain NFT ownership is verified and blocks non-owners", async () => {
    const userToken = await authenticateWallet(app, userKp);
    const otherToken = await authenticateWallet(app, otherKp);
    const unsyncedMint = Keypair.generate().publicKey.toBase58();

    // Non-owner rejected by on-chain ownership check
    verifyNftOwnershipFn.mockResolvedValueOnce({
      valid: false,
      error: "Connected wallet does not own this commitment NFT",
    });
    const nonOwnerRes = await request(app)
      .post("/api/proof")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({
        mintAddress: unsyncedMint,
        proofCid: "ipfs://QmProof123",
        recovery: {
          service: "Recovered Goal",
          deadline: "2030-02-01T12:00",
          stake: "0.25",
        },
      });
    expect(nonOwnerRes.status).toBe(403);

    // Real owner recovers and submits proof
    verifyNftOwnershipFn.mockResolvedValueOnce({ valid: true });
    const recoverRes = await request(app)
      .post("/api/proof")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        mintAddress: unsyncedMint,
        proofCid: "ipfs://QmProof123",
        recovery: {
          service: "Recovered Goal",
          deadline: "2030-02-01T12:00",
          stake: "0.25",
        },
      });
    expect(recoverRes.status).toBe(200);
    expect(recoverRes.body.success).toBe(true);

    // Second proof submission is rejected (409) since status is now PROOF_SUBMITTED
    const secondProof = await request(app)
      .post("/api/proof")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        mintAddress: unsyncedMint,
        proofCid: "ipfs://QmProofUpdated",
      });
    expect(secondProof.status).toBe(409);
  });

  it("enforces verifier-only approval and rejection transitions", async () => {
    const userToken = await authenticateWallet(app, userKp);
    const verifierToken = await authenticateWallet(app, verifierKp);
    const mintA = Keypair.generate().publicKey.toBase58();
    const mintB = Keypair.generate().publicKey.toBase58();

    // Create two tracked commitments
    for (const [idx, mint] of [mintA, mintB].entries()) {
      await request(app)
        .post("/api/track")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          mintAddress: mint,
          stakeSignature: `SigStakeInit_${idx}_1111111111111111111111111111`,
          metadataUri: "ipfs://QmMeta",
          service: `Task ${idx}`,
          renewalDate: idx === 1 ? "2020-01-01T00:00" : "2030-01-01T00:00",
          verifier: verifierWallet,
          stakeAmount: 0.2,
        });
    }

    // Cannot approve PENDING task before proof submission
    const approvePending = await request(app)
      .post("/api/approve")
      .set("Authorization", `Bearer ${verifierToken}`)
      .send({
        mintAddress: mintA,
        txSignature: "SigRefundA111111111111111111111111111111111111",
      });
    expect(approvePending.status).toBe(409);

    // Submit proof on mintA
    const proofRes = await request(app)
      .post("/api/proof")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ mintAddress: mintA, proofCid: "ipfs://QmProofA" });
    expect(proofRes.status).toBe(200);

    // Non-verifier cannot approve
    const userApprove = await request(app)
      .post("/api/approve")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        mintAddress: mintA,
        txSignature: "SigRefundA111111111111111111111111111111111111",
      });
    expect(userApprove.status).toBe(403);

    // Verifier approves mintA -> COMPLETED
    const okApprove = await request(app)
      .post("/api/approve")
      .set("Authorization", `Bearer ${verifierToken}`)
      .send({
        mintAddress: mintA,
        txSignature: "SigRefundA111111111111111111111111111111111111",
      });
    expect(okApprove.status).toBe(200);
    expect(okApprove.body.refundTx).toBe(
      "SigRefundA111111111111111111111111111111111111"
    );

    // Verifier rejects expired PENDING mintB -> FAILED
    const rejectExpired = await request(app)
      .post("/api/reject")
      .set("Authorization", `Bearer ${verifierToken}`)
      .send({ mintAddress: mintB });
    expect(rejectExpired.status).toBe(200);

    // Both tasks resolved, so verifier queue is empty
    const queue = await request(app)
      .get(`/api/verifier/${verifierWallet}`)
      .set("Authorization", `Bearer ${verifierToken}`);
    expect(queue.status).toBe(200);
    expect(queue.body).toEqual([]);
  });

  it("rejects invalid deadlines and malformed recovery stakes", async () => {
    const pinApp = createApp({
      dbPath,
      verifierWallet,
      verifySolTransferFn,
      verifyNftOwnershipFn,
      sendEmailFn,
      pinataJwt: "test-pinata-jwt",
      suppressWarnings: true,
    });
    const pinToken = await authenticateWallet(pinApp, userKp);
    const userToken = await authenticateWallet(app, userKp);
    const mint = Keypair.generate().publicKey.toBase58();

    const badPin = await request(pinApp)
      .post("/api/ipfs/pin")
      .set("Authorization", `Bearer ${pinToken}`)
      .send({
        metadata: {
          type: "commitment_v1",
          owner: userKp.publicKey.toBase58(),
          goal: "Run 5km",
          deadline: "not-a-valid-date",
        },
      });
    expect(badPin.status).toBe(400);

    const badTrack = await request(app)
      .post("/api/track")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        mintAddress: mint,
        stakeSignature: "SigBadDate1111111111111111111111111111111111",
        metadataUri: "ipfs://QmMeta",
        service: "Run 5km",
        renewalDate: "not-a-valid-date",
        verifier: verifierWallet,
        stakeAmount: 0.5,
      });
    expect(badTrack.status).toBe(400);

    const badRecoveryDeadline = await request(app)
      .post("/api/proof")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        mintAddress: mint,
        proofCid: "ipfs://QmProof",
        recovery: { service: "Recovered", deadline: "invalid-date", stake: "0.2" },
      });
    expect(badRecoveryDeadline.status).toBe(400);

    const badRecoveryStake = await request(app)
      .post("/api/proof")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        mintAddress: mint,
        proofCid: "ipfs://QmProof",
        recovery: { service: "Recovered", deadline: "2030-01-01T10:00", stake: "-1" },
      });
    expect(badRecoveryStake.status).toBe(400);
  });
});
