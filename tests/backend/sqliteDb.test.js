// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { Keypair } from "@solana/web3.js";
import { createApp } from "../../backend/app.js";
import { closeDB, readDB, updateDB } from "../../backend/db.js";

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

describe("Backend SQLite Storage & Migration", () => {
  let tmpDir;
  let sqlitePath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scap-sqlite-test-"));
    sqlitePath = path.join(tmpDir, "db.sqlite");
  });

  afterEach(() => {
    closeDB(sqlitePath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("migrates legacy db.json records once into SQLite and persists concurrent updates", async () => {
    const legacyJsonPath = path.join(tmpDir, "db.json");
    fs.writeFileSync(
      legacyJsonPath,
      JSON.stringify([
        {
          mintAddress: "MintLegacy1",
          owner: "Owner1",
          verifier: "Verifier1",
          status: "PENDING",
          service: "Legacy Task",
          renewalDate: "2030-01-01T10:00",
          stakeAmount: 0.25,
        },
      ])
    );

    const initial = readDB(sqlitePath);
    expect(initial).toHaveLength(1);
    expect(initial[0].mintAddress).toBe("MintLegacy1");

    // Concurrent updates execute serially through writeQueues + BEGIN IMMEDIATE
    await Promise.all([
      updateDB((rows) => {
        rows.push({
          mintAddress: "MintNew1",
          owner: "Owner1",
          verifier: "Verifier1",
          status: "PENDING",
          service: "Concurrent 1",
          stakeAmount: 0.5,
        });
      }, sqlitePath),
      updateDB((rows) => {
        rows.push({
          mintAddress: "MintNew2",
          owner: "Owner2",
          verifier: "Verifier1",
          status: "PROOF_SUBMITTED",
          service: "Concurrent 2",
          stakeAmount: 1,
        });
      }, sqlitePath),
    ]);

    closeDB(sqlitePath);
    const reloaded = readDB(sqlitePath);
    expect(reloaded.map((r) => r.mintAddress)).toEqual([
      "MintLegacy1",
      "MintNew1",
      "MintNew2",
    ]);
  });

  it("powers Express commitment routes end-to-end on SQLite", async () => {
    const userKp = Keypair.generate();
    const verifierKp = Keypair.generate();
    const verifierWallet = verifierKp.publicKey.toBase58();
    const mint = Keypair.generate().publicKey.toBase58();

    const app = createApp({
      dbPath: sqlitePath,
      verifierWallet,
      verifySolTransferFn: vi.fn(async () => ({ valid: true })),
      verifyNftOwnershipFn: vi.fn(async () => ({ valid: true })),
      sendEmailFn: vi.fn(async () => ({ messageId: "ok" })),
      suppressWarnings: true,
    });

    const userToken = await authenticateWallet(app, userKp);
    const trackRes = await request(app)
      .post("/api/track")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        mintAddress: mint,
        stakeSignature: "SigSqlite11111111111111111111111111111111111",
        metadataUri: "ipfs://QmSqliteMeta",
        service: "SQLite Verified Goal",
        renewalDate: "2030-05-01T09:00",
        verifier: verifierWallet,
        stakeAmount: 0.4,
      });

    expect(trackRes.status).toBe(200);
    const listRes = await request(app)
      .get("/api/commitments")
      .set("Authorization", `Bearer ${userToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].service).toBe("SQLite Verified Goal");
  });
});
