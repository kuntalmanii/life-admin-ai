import fs from "node:fs";
import fsp from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { DB_FILE } from "./config.js";

const require = createRequire(import.meta.url);
let cachedSqliteCtor = null;

function loadDatabaseSync() {
  if (!cachedSqliteCtor) {
    const sqliteModule = "node:" + "sqlite";
    cachedSqliteCtor = require(sqliteModule).DatabaseSync;
  }
  return cachedSqliteCtor;
}

/**
 * Unified commitment repository supporting:
 * - ACID SQLite (WAL mode via built-in node:sqlite) for persistent `.sqlite`/`.db` paths
 * - Write-through cached atomic JSON files for `.json` paths
 * All writes are serialized per DB file path via writeQueues.
 */
const dbCache = new Map();
const sqliteHandles = new Map();
const writeQueues = new Map();

const isJsonPath = (resolvedPath) =>
  resolvedPath.toLowerCase().endsWith(".json");

function insertRowsSqlite(sqlite, rows) {
  const stmt = sqlite.prepare(`
    INSERT INTO commitments (
      mintAddress,
      owner,
      verifier,
      status,
      renewalDate,
      stakeSignature,
      refundTx,
      data
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const row of rows) {
    if (!row?.mintAddress) continue;
    stmt.run(
      row.mintAddress,
      row.owner || "",
      row.verifier || "",
      row.status || "PENDING",
      row.renewalDate || null,
      row.stakeSignature || null,
      row.refundTx || null,
      JSON.stringify(row)
    );
  }
}

function maybeMigrateSiblingJson(sqlite, resolvedSqlitePath) {
  const { count } = sqlite
    .prepare("SELECT COUNT(*) AS count FROM commitments")
    .get();
  if (count > 0) return;

  const siblingJson = path.join(path.dirname(resolvedSqlitePath), "db.json");
  if (!fs.existsSync(siblingJson)) return;

  try {
    const raw = fs.readFileSync(siblingJson, "utf-8");
    const parsed = raw.trim() ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed) || parsed.length === 0) return;

    sqlite.exec("BEGIN IMMEDIATE");
    try {
      insertRowsSqlite(sqlite, parsed);
      sqlite.exec("COMMIT");
      console.log(
        `Migrated ${parsed.length} commitments from ${path.basename(siblingJson)} to ${path.basename(resolvedSqlitePath)}`
      );
    } catch (err) {
      sqlite.exec("ROLLBACK");
      throw err;
    }
  } catch (err) {
    console.warn("SQLite JSON migration skipped:", err.message);
  }
}

function getSqlite(resolvedPath) {
  if (sqliteHandles.has(resolvedPath)) {
    return sqliteHandles.get(resolvedPath);
  }

  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const DatabaseSync = loadDatabaseSync();
  const sqlite = new DatabaseSync(resolvedPath);
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA synchronous = NORMAL;");
  sqlite.exec("PRAGMA busy_timeout = 5000;");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS commitments (
      mintAddress TEXT PRIMARY KEY,
      owner TEXT NOT NULL DEFAULT '',
      verifier TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'PENDING',
      renewalDate TEXT,
      stakeSignature TEXT,
      refundTx TEXT,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_commitments_owner ON commitments(owner);
    CREATE INDEX IF NOT EXISTS idx_commitments_verifier_status ON commitments(verifier, status);
  `);

  maybeMigrateSiblingJson(sqlite, resolvedPath);
  sqliteHandles.set(resolvedPath, sqlite);
  return sqlite;
}

function readSqliteRows(resolvedPath) {
  const sqlite = getSqlite(resolvedPath);
  const rows = sqlite
    .prepare("SELECT data FROM commitments ORDER BY rowid ASC")
    .all();
  return rows.map((row) => JSON.parse(row.data));
}

function writeSqliteRows(resolvedPath, rows) {
  const sqlite = getSqlite(resolvedPath);
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    sqlite.exec("DELETE FROM commitments");
    insertRowsSqlite(sqlite, rows);
    sqlite.exec("COMMIT");
  } catch (err) {
    sqlite.exec("ROLLBACK");
    throw err;
  }
}

function ensureJsonDBSync(resolvedPath) {
  if (!fs.existsSync(resolvedPath)) {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, JSON.stringify([], null, 2));
  }
}

async function ensureJsonDBAsync(resolvedPath) {
  try {
    await fsp.access(resolvedPath);
  } catch {
    await fsp.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fsp.writeFile(resolvedPath, JSON.stringify([], null, 2));
  }
}

function readJsonDBSync(resolvedPath) {
  if (!dbCache.has(resolvedPath)) {
    ensureJsonDBSync(resolvedPath);
    const raw = fs.readFileSync(resolvedPath, "utf-8");
    const parsed = raw.trim() ? JSON.parse(raw) : [];
    dbCache.set(resolvedPath, parsed);
  }
  return structuredClone(dbCache.get(resolvedPath));
}

async function readJsonDBAsync(resolvedPath) {
  if (!dbCache.has(resolvedPath)) {
    await ensureJsonDBAsync(resolvedPath);
    const raw = await fsp.readFile(resolvedPath, "utf-8");
    const parsed = raw.trim() ? JSON.parse(raw) : [];
    dbCache.set(resolvedPath, parsed);
  }
  return structuredClone(dbCache.get(resolvedPath));
}

async function writeJsonDBAtomicAsync(data, resolvedPath) {
  await ensureJsonDBAsync(resolvedPath);
  const dir = path.dirname(resolvedPath);
  const tmpPath = path.join(dir, `.${path.basename(resolvedPath)}.${process.pid}.tmp`);
  try {
    await fsp.writeFile(tmpPath, JSON.stringify(data, null, 2));
    await fsp.rename(tmpPath, resolvedPath);
    dbCache.set(resolvedPath, structuredClone(data));
  } catch (err) {
    await fsp.unlink(tmpPath).catch(() => {});
    throw err;
  }
}

export function readDB(dbPath = DB_FILE) {
  const resolved = path.resolve(dbPath);
  return isJsonPath(resolved) ? readJsonDBSync(resolved) : readSqliteRows(resolved);
}

/**
 * Safely reads, transforms, and persists commitments under a per-path write queue.
 */
export function updateDB(mutator, dbPath = DB_FILE) {
  const resolved = path.resolve(dbPath);
  const previous = writeQueues.get(resolved) || Promise.resolve();
  const next = previous.then(async () => {
    if (isJsonPath(resolved)) {
      const db = await readJsonDBAsync(resolved);
      const result = await mutator(db);
      if (result !== false) {
        await writeJsonDBAtomicAsync(Array.isArray(result) ? result : db, resolved);
      }
      return result;
    }

    const db = readSqliteRows(resolved);
    const result = await mutator(db);
    if (result !== false) {
      writeSqliteRows(resolved, Array.isArray(result) ? result : db);
    }
    return result;
  });

  writeQueues.set(
    resolved,
    next.catch(() => {})
  );

  return next;
}

/**
 * Closes open SQLite handles and clears cached state (used during shutdown/tests).
 */
export function closeDB(dbPath) {
  if (dbPath) {
    const resolved = path.resolve(dbPath);
    dbCache.delete(resolved);
    const sqlite = sqliteHandles.get(resolved);
    if (sqlite) {
      sqlite.close();
      sqliteHandles.delete(resolved);
    }
    return;
  }

  dbCache.clear();
  for (const sqlite of sqliteHandles.values()) {
    sqlite.close();
  }
  sqliteHandles.clear();
}
