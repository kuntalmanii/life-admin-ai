import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { DB_FILE } from "./config.js";

/**
 * In-memory write-through cache + serialized async write queues per DB file path
 * so HTTP reads avoid disk I/O and concurrent writes never clobber each other.
 */
const dbCache = new Map();
const writeQueues = new Map();

function ensureDBSync(dbPath = DB_FILE) {
  const resolved = path.resolve(dbPath);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, JSON.stringify([], null, 2));
  }
  return resolved;
}

async function ensureDBAsync(dbPath = DB_FILE) {
  const resolved = path.resolve(dbPath);
  try {
    await fsp.access(resolved);
  } catch {
    await fsp.mkdir(path.dirname(resolved), { recursive: true });
    await fsp.writeFile(resolved, JSON.stringify([], null, 2));
  }
  return resolved;
}

export function readDB(dbPath = DB_FILE) {
  const resolved = path.resolve(dbPath);
  if (!dbCache.has(resolved)) {
    ensureDBSync(resolved);
    const raw = fs.readFileSync(resolved, "utf-8");
    const parsed = raw.trim() ? JSON.parse(raw) : [];
    dbCache.set(resolved, parsed);
  }
  return structuredClone(dbCache.get(resolved));
}

async function readDBAsync(dbPath = DB_FILE) {
  const resolved = path.resolve(dbPath);
  if (!dbCache.has(resolved)) {
    await ensureDBAsync(resolved);
    const raw = await fsp.readFile(resolved, "utf-8");
    const parsed = raw.trim() ? JSON.parse(raw) : [];
    dbCache.set(resolved, parsed);
  }
  return structuredClone(dbCache.get(resolved));
}

async function writeDBAtomicAsync(data, dbPath = DB_FILE) {
  const resolved = await ensureDBAsync(dbPath);
  const dir = path.dirname(resolved);
  const tmpPath = path.join(dir, `.${path.basename(resolved)}.${process.pid}.tmp`);
  try {
    await fsp.writeFile(tmpPath, JSON.stringify(data, null, 2));
    await fsp.rename(tmpPath, resolved);
    dbCache.set(resolved, structuredClone(data));
  } catch (err) {
    await fsp.unlink(tmpPath).catch(() => {});
    throw err;
  }
}

/**
 * Safely reads, transforms, and atomically writes the JSON database without blocking the event loop.
 */
export function updateDB(mutator, dbPath = DB_FILE) {
  const resolved = path.resolve(dbPath);
  const previous = writeQueues.get(resolved) || Promise.resolve();
  const next = previous.then(async () => {
    const db = await readDBAsync(resolved);
    const result = await mutator(db);
    if (result !== false) {
      await writeDBAtomicAsync(Array.isArray(result) ? result : db, resolved);
    }
    return result;
  });

  writeQueues.set(
    resolved,
    next.catch(() => {})
  );

  return next;
}
