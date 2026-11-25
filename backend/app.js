import express from "express";
import cors from "cors";
import { Keypair } from "@solana/web3.js";
import {
  ALLOW_SERVER_REFUND,
  ALLOWED_ORIGINS,
  APP_URL,
  DB_FILE,
  DEFAULT_VERIFIER,
  ENABLE_TEST_EMAIL,
  PINATA_JWT,
  SOLANA_NETWORK,
  inspectEscrowKeypair,
} from "./config.js";
import {
  createChallenge,
  isValidPublicKey,
  requireWalletAuth,
  verifyChallengeAndIssueToken,
} from "./auth.js";
import { createRateLimiter } from "./rateLimit.js";
import { readDB, updateDB } from "./db.js";
import { runReminderCheck } from "./reminderJob.js";
import {
  escapeHtml,
  generateICal,
  isValidEmail,
  sendEmail,
} from "./mailer.js";
import { refundStake } from "./refundStake.js";
import { verifyNftOwnership, verifySolTransfer } from "./solanaVerify.js";

const normalize = (value) => (typeof value === "string" ? value.trim() : "");

const isValidDateInput = (value) => {
  if (typeof value !== "string" && !(value instanceof Date)) return false;
  if (typeof value === "string" && !value.trim()) return false;
  return Number.isFinite(new Date(value).getTime());
};

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export function createApp(deps = {}) {
  const {
    dbPath = DB_FILE,
    verifierWallet = DEFAULT_VERIFIER,
    verifySolTransferFn = verifySolTransfer,
    verifyNftOwnershipFn = verifyNftOwnership,
    sendEmailFn = sendEmail,
    refundStakeFn = refundStake,
    runReminderCheckFn = runReminderCheck,
    pinataJwt = PINATA_JWT,
    allowServerRefund = ALLOW_SERVER_REFUND,
    enableTestEmail = ENABLE_TEST_EMAIL,
  } = deps;

  const escrowInfo = inspectEscrowKeypair();
  let escrowPublicKey = null;
  if (escrowInfo.secret) {
    escrowPublicKey = Keypair.fromSecretKey(escrowInfo.secret).publicKey.toBase58();
  }
  const escrowMatchesVerifier = escrowPublicKey === verifierWallet;

  if (escrowInfo.exists && !escrowMatchesVerifier && !deps.suppressWarnings) {
    console.warn(
      `[SECURITY] escrow.json (${escrowPublicKey || "invalid"}) does not match DEFAULT_VERIFIER (${verifierWallet}). Server-side refunds disabled.`
    );
  }

  const app = express();
  app.disable("x-powered-by");

  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    next();
  });

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error("Origin not allowed by CORS"));
      },
      methods: ["GET", "POST"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  const generalLimiter = createRateLimiter({ windowMs: 60_000, max: 90 });
  const strictLimiter = createRateLimiter({ windowMs: 60_000, max: 25 });
  app.use(generalLimiter);
  app.use(express.json({ limit: "64kb" }));

  /* ---------------- HEALTH ---------------- */

  app.get("/", (_req, res) => {
    res.json({
      ok: true,
      service: "Life Admin AI Backend",
      network: SOLANA_NETWORK,
    });
  });

  /* ---------------- WALLET AUTH ---------------- */

  app.post("/api/auth/challenge", strictLimiter, (req, res) => {
    const wallet = normalize(req.body?.wallet);
    if (!isValidPublicKey(wallet)) {
      return res.status(400).json({ error: "Valid Solana wallet is required" });
    }
    const challenge = createChallenge(wallet);
    res.json(challenge);
  });

  app.post("/api/auth/verify", strictLimiter, (req, res) => {
    const wallet = normalize(req.body?.wallet);
    const nonce = normalize(req.body?.nonce);
    const signature = normalize(req.body?.signature);

    const result = verifyChallengeAndIssueToken({ wallet, nonce, signature });
    if (!result.ok) {
      return res.status(401).json({ error: result.error });
    }
    res.json({
      token: result.token,
      wallet: result.wallet,
      exp: result.exp,
    });
  });

  /* ---------------- IPFS PROXY ---------------- */

  app.post(
    "/api/ipfs/pin",
    strictLimiter,
    requireWalletAuth,
    asyncHandler(async (req, res) => {
      if (!pinataJwt) {
        return res
          .status(503)
          .json({ error: "IPFS pinning is not configured on the server" });
      }

      const metadata = req.body?.metadata;
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return res.status(400).json({ error: "Invalid metadata object" });
      }

      if (metadata.type === "commitment_v1") {
        if (metadata.owner !== req.authWallet) {
          return res.status(403).json({ error: "Commitment owner mismatch" });
        }
        if (!normalize(metadata.goal) || !isValidDateInput(metadata.deadline)) {
          return res.status(400).json({ error: "Missing or invalid commitment metadata" });
        }
      } else if (metadata.type === "commitment_proof") {
        if (!isValidPublicKey(metadata.mintAddress) || !normalize(metadata.description)) {
          return res.status(400).json({ error: "Invalid proof metadata" });
        }
      } else {
        return res.status(400).json({ error: "Unsupported metadata type" });
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      let pinataRes;
      try {
        pinataRes = await fetch(
          "https://api.pinata.cloud/pinning/pinJSONToIPFS",
          {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${pinataJwt}`,
            },
            body: JSON.stringify(metadata),
          }
        );
      } catch (err) {
        if (err?.name === "AbortError") {
          return res.status(504).json({ error: "IPFS pinning timed out" });
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }

      if (!pinataRes.ok) {
        const errText = await pinataRes.text();
        console.error("Pinata upload failed:", errText);
        return res.status(502).json({ error: "Failed to pin metadata to IPFS" });
      }

      const data = await pinataRes.json().catch(() => null);
      if (!data || typeof data.IpfsHash !== "string" || !data.IpfsHash.trim()) {
        return res.status(502).json({ error: "Invalid response from IPFS provider" });
      }
      res.json({ ipfsUri: `ipfs://${data.IpfsHash}` });
    })
  );

  /* ---------------- COMMITMENTS ---------------- */

  app.get("/api/commitments", requireWalletAuth, (req, res) => {
    const ownCommitments = readDB(dbPath).filter(
      (item) => item.owner === req.authWallet
    );
    res.json(ownCommitments);
  });

  app.post(
    "/api/track",
    strictLimiter,
    requireWalletAuth,
    asyncHandler(async (req, res) => {
      const {
        mintAddress,
        owner: bodyOwner,
        email,
        metadataUri,
        renewalDate,
        deadline,
        service,
        goal,
        stakeAmount,
        stake,
        verifier,
        stakeSignature,
      } = req.body;

      const owner = req.authWallet;
      if (bodyOwner && bodyOwner !== owner) {
        return res.status(403).json({ error: "Wallet ownership mismatch" });
      }

      const mint = normalize(mintAddress);
      const uri = normalize(metadataUri);
      const sig = normalize(stakeSignature);
      const finalVerifier = normalize(verifier) || verifierWallet;

      if (!isValidPublicKey(mint) || !uri.startsWith("ipfs://") || !sig) {
        return res.status(400).json({
          error: "Valid mintAddress, ipfs:// metadataUri, and stakeSignature are required",
        });
      }

      if (finalVerifier !== verifierWallet) {
        return res.status(400).json({ error: "Invalid verifier wallet" });
      }

      const finalDeadline = renewalDate || deadline;
      const finalService = normalize(service || goal);
      const finalStake = parseFloat(stakeAmount || stake || "0");

      if (
        !finalService ||
        !isValidDateInput(finalDeadline) ||
        !Number.isFinite(finalStake) ||
        finalStake <= 0
      ) {
        return res.status(400).json({ error: "Invalid commitment details" });
      }

      const cleanEmail = normalize(email);
      if (cleanEmail && !isValidEmail(cleanEmail)) {
        return res.status(400).json({ error: "Invalid email address" });
      }

      const txCheck = await verifySolTransferFn({
        signature: sig,
        expectedFrom: owner,
        expectedTo: finalVerifier,
        minSol: finalStake,
      });
      if (!txCheck.valid) {
        return res.status(400).json({ error: txCheck.error });
      }

      let conflictError = null;
      let alreadyTracked = false;

      await updateDB((db) => {
        if (db.find((x) => x.mintAddress === mint)) {
          alreadyTracked = true;
          return false;
        }

        if (db.some((x) => x.stakeSignature === sig)) {
          conflictError = "Stake transaction signature already redeemed";
          return false;
        }

        db.push({
          mintAddress: mint,
          owner,
          verifier: finalVerifier,
          email: cleanEmail || undefined,
          metadataUri: uri,
          stakeSignature: sig,
          service: finalService,
          renewalDate: finalDeadline,
          stakeAmount: finalStake,
          status: "PENDING",
          createdAt: new Date().toISOString(),
          lastNotified: null,
        });
        return db;
      }, dbPath);

      if (conflictError) {
        return res.status(409).json({ error: conflictError });
      }

      if (alreadyTracked) {
        return res.json({ message: "Already tracked" });
      }

      if (cleanEmail && finalDeadline) {
        const start = new Date(finalDeadline);
        const end = new Date(start.getTime() + 60 * 60 * 1000);

        try {
          await sendEmailFn({
            to: cleanEmail,
            subject: `🔒 Locked: ${finalService}`,
            html: `<h2>${escapeHtml(finalService)}</h2><p>Deadline: ${escapeHtml(start.toLocaleString())}</p>`,
            icalEvent: generateICal({
              service: finalService,
              start,
              end,
              description: `Stake: ${finalStake} SOL`,
              url: APP_URL,
            }),
          });
        } catch (emailErr) {
          console.warn("Confirmation email failed:", emailErr.message);
        }
      }

      res.json({ success: true });
    })
  );

  /* ---------------- PROOF SUBMISSION ---------------- */

  app.post(
    "/api/proof",
    strictLimiter,
    requireWalletAuth,
    asyncHandler(async (req, res) => {
      const { mintAddress, proofCid, submittedBy, recovery } = req.body;
      const mint = normalize(mintAddress);
      const cid = normalize(proofCid);
      const actor = req.authWallet;

      if (submittedBy && submittedBy !== actor) {
        return res.status(403).json({ error: "Wallet ownership mismatch" });
      }

      if (!isValidPublicKey(mint) || !cid.startsWith("ipfs://") || cid.length > 200) {
        return res.status(400).json({ error: "Valid mintAddress and ipfs:// proofCid required" });
      }

      const existing = readDB(dbPath).find((x) => x.mintAddress === mint);
      let recoveryStake = 0;

      if (!existing) {
        const recoveryService = normalize(recovery?.service);
        const recoveryDeadline = recovery?.deadline;
        if (!recoveryService || !recoveryDeadline) {
          return res.status(404).json({ error: "Commitment not found" });
        }
        if (!isValidDateInput(recoveryDeadline)) {
          return res.status(400).json({ error: "Invalid recovery deadline" });
        }
        const rawStake = recovery?.stake;
        if (rawStake !== undefined && rawStake !== null && rawStake !== "") {
          recoveryStake = Number(rawStake);
          if (!Number.isFinite(recoveryStake) || recoveryStake < 0) {
            return res.status(400).json({ error: "Invalid recovery stake amount" });
          }
        }
        const nftCheck = await verifyNftOwnershipFn({
          mintAddress: mint,
          expectedOwner: actor,
        });
        if (!nftCheck.valid) {
          return res.status(403).json({ error: nftCheck.error });
        }
      }

      let statusCode = 200;
      let errorMessage = null;

      await updateDB((db) => {
        let item = db.find((x) => x.mintAddress === mint);

        if (!item) {
          item = {
            mintAddress: mint,
            owner: actor,
            verifier: verifierWallet,
            metadataUri: "recovered-from-chain",
            service: normalize(recovery.service),
            renewalDate: recovery.deadline,
            stakeAmount: recoveryStake,
            status: "PENDING",
            createdAt: new Date().toISOString(),
            lastNotified: null,
          };
          db.push(item);
        } else if (item.owner !== actor) {
          statusCode = 403;
          errorMessage = "Not owner";
          return false;
        } else if (item.status !== "PENDING") {
          statusCode = 409;
          errorMessage = `Cannot submit proof when status is ${item.status}`;
          return false;
        }

        item.proofCid = cid;
        item.status = "PROOF_SUBMITTED";
        item.proofSubmittedAt = new Date().toISOString();
        return db;
      }, dbPath);

      if (errorMessage) {
        return res.status(statusCode).json({ error: errorMessage });
      }

      res.json({ success: true });
    })
  );

  /* ---------------- VERIFIER ---------------- */

  app.get("/api/verifier/:wallet", requireWalletAuth, (req, res) => {
    const { wallet } = req.params;
    if (req.authWallet !== wallet || req.authWallet !== verifierWallet) {
      return res.status(403).json({ error: "Verifier wallet access only" });
    }

    const tasks = readDB(dbPath).filter(
      (t) =>
        t.verifier === wallet &&
        (t.status === "PROOF_SUBMITTED" || t.status === "PENDING")
    );
    res.json(tasks);
  });

  app.post(
    "/api/approve",
    strictLimiter,
    requireWalletAuth,
    asyncHandler(async (req, res) => {
      const { mintAddress, verifier, txSignature } = req.body;
      const mint = normalize(mintAddress);
      const sig = normalize(txSignature);

      if (verifier && verifier !== req.authWallet) {
        return res.status(403).json({ error: "Verifier wallet mismatch" });
      }

      const db = readDB(dbPath);
      const item = db.find((x) => x.mintAddress === mint);

      if (!item) return res.status(404).json({ error: "Not found" });
      if (item.verifier !== req.authWallet || req.authWallet !== verifierWallet) {
        return res.status(403).json({ error: "Unauthorized" });
      }
      if (item.status !== "PROOF_SUBMITTED") {
        return res.status(409).json({
          error: `Only PROOF_SUBMITTED tasks can be approved (current: ${item.status})`,
        });
      }

      let finalSig = sig;

      if (finalSig) {
        if (db.some((x) => x.refundTx === finalSig)) {
          return res.status(409).json({ error: "Refund transaction already used" });
        }

        const txCheck = await verifySolTransferFn({
          signature: finalSig,
          expectedFrom: item.verifier,
          expectedTo: item.owner,
          minSol: item.stakeAmount,
        });
        if (!txCheck.valid) {
          return res.status(400).json({ error: txCheck.error });
        }
      } else {
        if (!allowServerRefund || !escrowMatchesVerifier) {
          return res.status(400).json({
            error:
              "On-chain refund txSignature is required (server-side escrow refunds disabled)",
          });
        }

        finalSig = await refundStakeFn({
          toWallet: item.owner,
          amountSol: item.stakeAmount,
        });
      }

      let conflict = null;
      await updateDB((latestDb) => {
        const target = latestDb.find((x) => x.mintAddress === mint);
        if (!target) {
          conflict = "Not found";
          return false;
        }
        if (target.status !== "PROOF_SUBMITTED") {
          conflict = "Commitment already resolved";
          return false;
        }
        if (finalSig && latestDb.some((x) => x.refundTx === finalSig)) {
          conflict = "Refund transaction already used";
          return false;
        }
        target.status = "COMPLETED";
        target.refundTx = finalSig;
        target.resolvedAt = new Date().toISOString();
        return latestDb;
      }, dbPath);

      if (conflict) {
        return res.status(409).json({ error: conflict });
      }

      res.json({ success: true, refundTx: finalSig });
    })
  );

  app.post(
    "/api/reject",
    strictLimiter,
    requireWalletAuth,
    asyncHandler(async (req, res) => {
      const { mintAddress, verifier } = req.body;
      const mint = normalize(mintAddress);

      if (verifier && verifier !== req.authWallet) {
        return res.status(403).json({ error: "Verifier wallet mismatch" });
      }

      let statusCode = 200;
      let errorMessage = null;

      await updateDB((db) => {
        const item = db.find((x) => x.mintAddress === mint);
        if (!item) {
          statusCode = 404;
          errorMessage = "Not found";
          return false;
        }
        if (item.verifier !== req.authWallet || req.authWallet !== verifierWallet) {
          statusCode = 403;
          errorMessage = "Unauthorized";
          return false;
        }

        const expired =
          item.renewalDate && new Date(item.renewalDate) < new Date();
        if (item.status !== "PROOF_SUBMITTED" && !(item.status === "PENDING" && expired)) {
          statusCode = 409;
          errorMessage = "Only submitted or expired commitments can be rejected";
          return false;
        }

        item.status = "FAILED";
        item.resolvedAt = new Date().toISOString();
        return db;
      }, dbPath);

      if (errorMessage) {
        return res.status(statusCode).json({ error: errorMessage });
      }

      res.json({ success: true });
    })
  );

  /* ---------------- ADMIN / REMINDERS ---------------- */

  app.post(
    "/api/run-reminders",
    strictLimiter,
    requireWalletAuth,
    asyncHandler(async (req, res) => {
      if (req.authWallet !== verifierWallet) {
        return res.status(403).json({ error: "Admin verifier wallet required" });
      }
      await runReminderCheckFn(dbPath);
      res.json({ success: true });
    })
  );

  app.get(
    "/api/test-email",
    strictLimiter,
    requireWalletAuth,
    asyncHandler(async (req, res) => {
      if (process.env.NODE_ENV === "production" && !enableTestEmail) {
        return res.status(404).json({ error: "Not available in production" });
      }
      if (req.authWallet !== verifierWallet) {
        return res.status(403).json({ error: "Admin verifier wallet required" });
      }

      const to = normalize(req.query.to);
      if (!isValidEmail(to)) {
        return res.status(400).json({ error: "Valid ?to=email required" });
      }

      await sendEmailFn({
        to,
        subject: "✅ Life Admin AI – Email Working",
        text: "Email system is configured correctly.",
        html: "<h2>✅ Email system working</h2>",
      });

      res.json({ success: true });
    })
  );

  app.use((err, _req, res, _next) => {
    if (err?.message === "Origin not allowed by CORS") {
      return res.status(403).json({ error: err.message });
    }
    if (err?.type === "entity.too.large") {
      return res.status(413).json({ error: "Payload exceeds 64kb limit" });
    }
    if (err?.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Malformed JSON payload" });
    }
    console.error("Unhandled server error:", err);
    res.status(err?.status || 500).json({ error: err.message || "Internal server error" });
  });

  return app;
}
