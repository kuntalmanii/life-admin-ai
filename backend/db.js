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
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify([], null, 2));
  }
}

async function ensureDBAsync(dbPath = DB_FILE) {
  try {
    await fsp.access(dbPath);
  } catch {
    await fsp.writeFile(dbPath, JSON.stringify([], null, 2));
  }
}

export function readDB(dbPath = DB_FILE) {
  if (!dbCache.has(dbPath)) {
    ensureDBSync(dbPath);
    const raw = fs.readFileSync(dbPath, "utf-8");
    const parsed = raw.trim() ? JSON.parse(raw) : [];
    dbCache.set(dbPath, parsed);
  }
  return structuredClone(dbCache.get(dbPath));
}

async function readDBAsync(dbPath = DB_FILE) {
  if (!dbCache.has(dbPath)) {
    await ensureDBAsync(dbPath);
    const raw = await fsp.readFile(dbPath, "utf-8");
    const parsed = raw.trim() ? JSON.parse(raw) : [];
    dbCache.set(dbPath, parsed);
  }
  return structuredClone(dbCache.get(dbPath));
}

async function writeDBAtomicAsync(data, dbPath = DB_FILE) {
  await ensureDBAsync(dbPath);
  const dir = path.dirname(dbPath);
  const tmpPath = path.join(dir, `.${path.basename(dbPath)}.${process.pid}.tmp`);
  await fsp.writeFile(tmpPath, JSON.stringify(data, null, 2));
  await fsp.rename(tmpPath, dbPath);
  dbCache.set(dbPath, structuredClone(data));
}

/**
 * Safely reads, transforms, and atomically writes the JSON database without blocking the event loop.
 */
export function updateDB(mutator, dbPath = DB_FILE) {
  const previous = writeQueues.get(dbPath) || Promise.resolve();
  const next = previous.then(async () => {
    const db = await readDBAsync(dbPath);
    const result = await mutator(db);
    if (result !== false) {
      await writeDBAtomicAsync(Array.isArray(result) ? result : db, dbPath);
    }
    return result;
  });

  writeQueues.set(
    dbPath,
    next.catch(() => {})
  );

  return next;
}
