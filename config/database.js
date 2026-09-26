/**
 * DiDwa - Neon PostgreSQL Connection Pool
 * Row-Level Multi-Tenancy: every tenant table carries store_id and every
 * query is scoped through helpers in this module.
 */
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || '';
const ON_VERCEL = Boolean(process.env.VERCEL);

// A serverless function with no DATABASE_URL must fail loudly. Silently falling
// back to localhost:5432 produced `connect ECONNREFUSED 127.0.0.1:5432` and an
// opaque 500 on every route instead of an actionable configuration error.
if (!connectionString && ON_VERCEL) {
  throw new Error(
    'DATABASE_URL is not set. Add it in Vercel -> Project Settings -> Environment '
    + 'Variables (use the Neon pooled connection string) and redeploy.',
  );
}
if (!connectionString) {
  console.warn(
    '[db] DATABASE_URL is not set - falling back to a local PostgreSQL at '
    + 'localhost:5432. Every API request will fail until it is configured.',
  );
}

// Neon requires TLS. Detect a Neon endpoint, or allow explicit override.
const isNeon = /\.neon\.tech/i.test(connectionString);
const useSsl = isNeon || /sslmode=require/i.test(connectionString) ||
  String(process.env.PGSSL ?? '').toLowerCase() === 'true';

export const pool = new pg.Pool({
  connectionString: connectionString || undefined,
  host: connectionString ? undefined : process.env.PGHOST || 'localhost',
  port: connectionString ? undefined : Number(process.env.PGPORT || 5432),
  user: connectionString ? undefined : process.env.PGUSER || 'postgres',
  password: connectionString ? undefined : process.env.PGPASSWORD || 'postgres',
  database: connectionString ? undefined : process.env.PGDATABASE || 'didwa',
  max: Number(process.env.PGPOOL_MAX || (process.env.VERCEL ? 3 : 10)),
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  console.error('[db] idle client error:', err.message);
});

/** Parameterized single query. Never interpolate user input into `text`. */
export async function query(text, params = []) {
  return pool.query(text, params);
}

/**
 * Run `fn` inside a dedicated client transaction.
 * fn receives a tagged t.query(t, client). Commits on resolve,
 * rolls back on throw, always releases the client.
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const t = {
      client,
      query: (text, params = []) => client.query(text, params),
    };
    const result = await fn(t);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    throw err;
  } finally {
    client.release();
  }
}

/** Health probe used by /health and startup checks. */
export async function pingDb() {
  const { rows } = await pool.query('SELECT NOW() AS now');
  return rows[0];
}

/** Postgres SQLSTATE for "relation does not exist" (undefined table). */
export const UNDEFINED_TABLE = '42P01';

/** True when a Postgres error means the schema has not been applied yet. */
export function isMissingSchemaError(err) {
  return err && (err.code === UNDEFINED_TABLE || /does not exist/i.test(err.message || ''));
}

/**
 * Confirms the schema is present by touching the tenants table. A reachable
 * database with no tables is a distinct (and very common) misconfiguration:
 * DATABASE_URL is set but `npm run db:init` was never run against it.
 */
export async function assertSchema() {
  const { rows } = await pool.query('SELECT 1 FROM stores LIMIT 1');
  return rows.length >= 0;
}

export default { pool, query, withTransaction, pingDb, assertSchema, isMissingSchemaError };
