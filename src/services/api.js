import { API_BASE_URL } from "../config";

// In-memory session cache keyed by base58 wallet address
const sessionCache = new Map();
const inflightAuth = new Map();

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function clearWalletSession(walletAddress) {
  if (walletAddress) {
    sessionCache.delete(walletAddress);
  } else {
    sessionCache.clear();
  }
}

function extractErrorMessage(data, res, fallback) {
  if (typeof data?.error === "string" && data.error.trim()) {
    return data.error;
  }
  if (typeof data?.error?.message === "string" && data.error.message.trim()) {
    return data.error.message;
  }
  if (typeof data?.message === "string" && data.message.trim()) {
    return data.message;
  }
  return `${fallback} (HTTP ${res.status})`;
}

async function safeFetchJson(path, fetchOptions = {}, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error("Backend request timed out");
    }
    if (err instanceof TypeError || /failed to fetch/i.test(err?.message || "")) {
      throw new Error(
        `Cannot reach backend API (${API_BASE_URL || "same-origin"}). Make sure the backend server is running and CORS allows this origin.`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function ensureWalletSession(wallet) {
  const walletAddress = wallet?.publicKey?.toBase58?.();
  if (!walletAddress) {
    throw new Error("Wallet not connected");
  }

  const cached = sessionCache.get(walletAddress);
  if (cached && cached.exp - 30_000 > Date.now()) {
    return cached.token;
  }

  if (inflightAuth.has(walletAddress)) {
    return inflightAuth.get(walletAddress);
  }

  const authPromise = (async () => {
    if (typeof wallet.signMessage !== "function") {
      throw new Error("Connected wallet does not support message signing");
    }

    const { res: challengeRes, data: challengeData } = await safeFetchJson(
      "/api/auth/challenge",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: walletAddress }),
      }
    );
    if (!challengeRes.ok) {
      throw new Error(
        extractErrorMessage(challengeData, challengeRes, "Failed to start wallet sign-in")
      );
    }

    const messageBytes = new TextEncoder().encode(challengeData.message);
    const signatureBytes = await wallet.signMessage(messageBytes);

    const { res: verifyRes, data: verifyData } = await safeFetchJson(
      "/api/auth/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: walletAddress,
          nonce: challengeData.nonce,
          signature: bytesToBase64(signatureBytes),
        }),
      }
    );
    if (!verifyRes.ok) {
      throw new Error(
        extractErrorMessage(
          verifyData,
          verifyRes,
          "Wallet signature verification failed"
        )
      );
    }

    sessionCache.set(walletAddress, {
      token: verifyData.token,
      exp: verifyData.exp,
    });
    return verifyData.token;
  })();

  inflightAuth.set(walletAddress, authPromise);
  try {
    return await authPromise;
  } finally {
    inflightAuth.delete(walletAddress);
  }
}

async function request(path, options = {}, wallet = null) {
  const { timeoutMs = 20_000, headers: customHeaders, ...fetchOptions } = options;

  const send = (token) =>
    safeFetchJson(
      path,
      {
        ...fetchOptions,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...customHeaders,
        },
      },
      timeoutMs
    );

  let token = wallet ? await ensureWalletSession(wallet) : null;
  let { res, data } = await send(token);

  // If server restarted / token expired, clear cache and re-authenticate once
  if (res.status === 401 && wallet?.publicKey) {
    clearWalletSession(wallet.publicKey.toBase58());
    token = await ensureWalletSession(wallet);
    ({ res, data } = await send(token));
  }

  if (!res.ok) {
    throw new Error(extractErrorMessage(data, res, "Request failed"));
  }
  return data;
}

export function pinMetadataToIPFS(metadata, wallet) {
  return request(
    "/api/ipfs/pin",
    {
      method: "POST",
      body: JSON.stringify({ metadata }),
    },
    wallet
  );
}

export function fetchCommitments(wallet) {
  return request("/api/commitments", {}, wallet);
}

export function trackCommitment(payload, wallet) {
  return request(
    "/api/track",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    wallet
  );
}

export function submitProof(payload, wallet) {
  return request(
    "/api/proof",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    wallet
  );
}

export function fetchVerifierTasks(walletAddress, wallet) {
  return request(
    `/api/verifier/${encodeURIComponent(walletAddress)}`,
    {},
    wallet
  );
}

export function approveCommitment(payload, wallet) {
  return request(
    "/api/approve",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    wallet
  );
}

export function rejectCommitment(payload, wallet) {
  return request(
    "/api/reject",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    wallet
  );
}

export function planCommitmentAI(payload, wallet) {
  return request(
    "/api/ai/plan",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    wallet
  );
}

export function verifyProofAI(payload, wallet) {
  return request(
    "/api/ai/verify-proof",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    wallet
  );
}
