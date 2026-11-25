import { resolveIpfsUrl } from "./format";

const STORAGE_PREFIX = "life_admin_ipfs_v1:";
const MAX_MEMORY_ENTRIES = 200;

const memoryCache = new Map();
const inflightRequests = new Map();

function readStorage(key) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    // Ignore quota / private-browsing storage errors
  }
}

function setMemoryCache(key, value) {
  if (memoryCache.size >= MAX_MEMORY_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value;
    memoryCache.delete(oldestKey);
  }
  memoryCache.set(key, value);
}

/**
 * Fetches immutable IPFS JSON metadata with in-memory + localStorage caching,
 * in-flight request deduplication, and an AbortController timeout.
 */
export async function fetchIpfsJson(uri, { timeoutMs = 8000 } = {}) {
  if (!uri) throw new Error("Missing IPFS URI");

  if (memoryCache.has(uri)) {
    return memoryCache.get(uri);
  }

  const persisted = readStorage(uri);
  if (persisted) {
    setMemoryCache(uri, persisted);
    return persisted;
  }

  if (inflightRequests.has(uri)) {
    return inflightRequests.get(uri);
  }

  const fetchPromise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(resolveIpfsUrl(uri), {
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`IPFS gateway error (${res.status})`);
      }
      const data = await res.json();
      setMemoryCache(uri, data);
      writeStorage(uri, data);
      return data;
    } finally {
      clearTimeout(timer);
      inflightRequests.delete(uri);
    }
  })();

  inflightRequests.set(uri, fetchPromise);
  return fetchPromise;
}

/**
 * Maps items with bounded concurrency to avoid saturating public IPFS gateways.
 */
export async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await mapper(items[idx], idx);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
