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

    const challengeRes = await fetch(`${API_BASE_URL}/api/auth/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: walletAddress }),
    });
    const challengeData = await challengeRes.json().catch(() => ({}));
    if (!challengeRes.ok) {
      throw new Error(challengeData.error || "Failed to start wallet sign-in");
    }

    const messageBytes = new TextEncoder().encode(challengeData.message);
    const signatureBytes = await wallet.signMessage(messageBytes);

    const verifyRes = await fetch(`${API_BASE_URL}/api/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet: walletAddress,
        nonce: challengeData.nonce,
        signature: bytesToBase64(signatureBytes),
      }),
    });
    const verifyData = await verifyRes.json().catch(() => ({}));
    if (!verifyRes.ok) {
      throw new Error(verifyData.error || "Wallet signature verification failed");
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
  const send = async (token) => {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  };

  let token = wallet ? await ensureWalletSession(wallet) : null;
  let { res, data } = await send(token);

  // If server restarted / token expired, clear cache and re-authenticate once
  if (res.status === 401 && wallet?.publicKey) {
    clearWalletSession(wallet.publicKey.toBase58());
    token = await ensureWalletSession(wallet);
    ({ res, data } = await send(token));
  }

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
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
