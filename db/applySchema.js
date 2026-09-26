/**
 * db/applySchema.js
 * Idempotent, concurrency-safe application of db/schema.sql.
 *
 * Why this exists: the schema used to be applied by hand (`npm run db:init`).
 * That step is easy to forget on a fresh deployment, and the symptom is an
 * opaque `relation "stores" does not exist` on every request. This module lets
 * the running app apply the schema itself, so a fresh database becomes usable
 * without any manual step.
 *
 * Safety properties:
 *   - Runs inside a single transaction, so a failure leaves nothing half-applied.
 *   - Takes a Postgres advisory lock, so concurrent serverless cold starts
 *     cannot race each other into conflicting DDL.
 *   - Skips entirely when the applied checksum matches the file, so a warm
 *     instance does no DDL work on every request.
 *   - The schema uses IF NOT EXISTS throughout, so re-applying is safe.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

/** Stable advisory-lock key so all instances agree on the same lock. */
const LOCK_KEY = 8_147_231;

/**
 * Split a SQL file into individual statements.
 *
 * A naive split on ';' corrupts the schema because the trial-period trigger is
 * a dollar-quoted function body containing semicolons. This splitter tracks
 * string, quoted-identifier, dollar-quote, line-comment and block-comment state
 * so only top-level semicolons terminate a statement.
 */
export function splitSql(sql) {
  const statements = [];
  let current = '';
  let i = 0;
  let dollarTag = null;

  const len = sql.length;
  while (i < len) {
    const ch = sql[i];
    const next = sql[i + 1];

    // Line comment
    if (ch === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? len : end;
      continue;
    }

    // Block comment
    if (ch === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? len : end + 2;
      continue;
    }

    // Dollar-quoted block ($tag$ ... $tag$)
    if (ch === '$') {
      const match = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i));
      if (match) {
        const tag = match[0];
        if (dollarTag === null) {
          dollarTag = tag;
          current += tag;
          i += tag.length;
          continue;
        }
        if (dollarTag === tag) {
          current += tag;
          i += tag.length;
          dollarTag = null;
          continue;
        }
      }
    }

    // Single-quoted string ('' escapes)
    if (ch === "'" && dollarTag === null) {
      current += ch;
      i += 1;
      while (i < len) {
        if (sql[i] === "'" && sql[i + 1] === "'") { current += "''"; i += 2; continue; }
        current += sql[i];
        if (sql[i] === "'") { i += 1; break; }
        i += 1;
      }
      continue;
    }

    // Double-quoted identifier ("" escapes)
    if (ch === '"' && dollarTag === null) {
      current += ch;
      i += 1;
      while (i < len) {
        if (sql[i] === '"' && sql[i + 1] === '"') { current += '""'; i += 2; continue; }
        current += sql[i];
        if (sql[i] === '"') { i += 1; break; }
        i += 1;
      }
      continue;
    }

    // Top-level statement terminator
    if (ch === ';' && dollarTag === null) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

function checksum(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Applies db/schema.sql when the stored checksum differs from the file.
 * @param {(sql: string) => Promise<unknown>} exec
 * @param {{ quiet?: boolean }} [options]
 * @returns {Promise<{ applied: boolean, statements: number, checksum: string, reason?: string }>}
 */
export async function applySchemaIfMissing(exec, { quiet = true } = {}) {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const sum = checksum(sql);

  // Track applied state outside the schema so the marker table survives schema edits.
  await exec(`
    CREATE TABLE IF NOT EXISTS schema_state (
      id         INTEGER PRIMARY KEY DEFAULT 1,
      checksum   TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await exec('SELECT pg_advisory_lock(' + LOCK_KEY + ')');
  try {
    let existing = null;
    try {
      const res = await exec('SELECT checksum FROM schema_state WHERE id = 1');
      existing = res?.rows?.[0]?.checksum || null;
    } catch {
      existing = null; // marker table is empty
    }

    if (existing === sum) {
      return { applied: false, statements: 0, checksum: sum, reason: 'already-current' };
    }

    const statements = splitSql(sql);
    await exec('BEGIN');
    try {
      for (const statement of statements) {
        await exec(statement);
      }
      await exec(
        'INSERT INTO schema_state (id, checksum, applied_at) VALUES (1, '
        + quoteLiteral(sum) + ', NOW()) ON CONFLICT (id) DO UPDATE SET '
        + 'checksum = EXCLUDED.checksum, applied_at = EXCLUDED.applied_at',
      );
      await exec('COMMIT');
    } catch (err) {
      try { await exec('ROLLBACK'); } catch { /* noop */ }
      throw err;
    }

    if (!quiet) {
      console.log(`[db] schema applied automatically (${statements.length} statements).`);
    }
    return { applied: true, statements: statements.length, checksum: sum };
  } finally {
    await exec('SELECT pg_advisory_unlock(' + LOCK_KEY + ')');
  }
}

function quoteLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export default applySchemaIfMissing;
