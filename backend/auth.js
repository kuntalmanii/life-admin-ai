import crypto from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { AUTH_SECRET } from "./config.js";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 60 * 60 * 1000;
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

// Single-use nonces keyed by nonce string
const pendingChallenges = new Map();

function pruneChallenges() {
  const now = Date.now();
  for (const [nonce, entry] of pendingChallenges.entries()) {
    if (entry.expiresAt <= now) {
      pendingChallenges.delete(nonce);
    }
  }
}

export function isValidPublicKey(address) {
  if (typeof address !== "string" || address.length < 32 || address.length > 48) {
    return false;
  }
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

function buildChallengeMessage({ wallet, nonce, issuedAt }) {
  return [
    "Life Admin AI Wallet Authentication",
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

export function createChallenge(wallet) {
  if (!isValidPublicKey(wallet)) {
    throw new Error("Invalid Solana wallet address");
  }

  if (pendingChallenges.size > 500) {
    pruneChallenges();
  }

  const nonce = crypto.randomBytes(24).toString("hex");
  const issuedAt = new Date().toISOString();
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  const message = buildChallengeMessage({ wallet, nonce, issuedAt });

  pendingChallenges.set(nonce, { wallet, message, expiresAt });

  return { nonce, message, expiresAt };
}

function verifyEd25519Signature(wallet, message, signatureBase64) {
  try {
    if (typeof signatureBase64 !== "string") return false;
    const signature = Buffer.from(signatureBase64, "base64");
    if (signature.length !== 64) return false;

    const rawPubKey = Buffer.from(new PublicKey(wallet).toBytes());
    const spkiDer = Buffer.concat([ED25519_SPKI_PREFIX, rawPubKey]);
    const keyObj = crypto.createPublicKey({
      key: spkiDer,
      format: "der",
      type: "spki",
    });

    return crypto.verify(
      null,
      Buffer.from(message, "utf8"),
      keyObj,
      signature
    );
  } catch {
    return false;
  }
}

function signSessionToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const sig = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encoded, providedSig] = parts;
  const expectedSig = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(encoded)
    .digest("base64url");

  const providedBuf = Buffer.from(providedSig, "utf8");
  const expectedBuf = Buffer.from(expectedSig, "utf8");
  if (
    providedBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    );
    if (!payload?.wallet || !payload?.exp || payload.exp <= Date.now()) {
      return null;
    }
    if (!isValidPublicKey(payload.wallet)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function verifyChallengeAndIssueToken({ wallet, nonce, signature }) {
  if (!isValidPublicKey(wallet) || typeof nonce !== "string") {
    return { ok: false, error: "Invalid authentication payload" };
  }

  const record = pendingChallenges.get(nonce);
  // Consume nonce immediately to block replay attempts
  pendingChallenges.delete(nonce);

  if (!record || record.expiresAt <= Date.now()) {
    return { ok: false, error: "Authentication challenge expired" };
  }

  if (record.wallet !== wallet) {
    return { ok: false, error: "Challenge wallet mismatch" };
  }

  if (!verifyEd25519Signature(wallet, record.message, signature)) {
    return { ok: false, error: "Invalid wallet signature" };
  }

  const now = Date.now();
  const exp = now + SESSION_TTL_MS;
  const token = signSessionToken({ wallet, iat: now, exp });

  return { ok: true, token, wallet, exp };
}

export function requireWalletAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  const payload = verifySessionToken(token);
  if (!payload) {
    return res
      .status(401)
      .json({ error: "Wallet signature authentication required" });
  }

  req.authWallet = payload.wallet;
  next();
}
