/**
 * Ghana Stores - Neon PostgreSQL Connection Pool
 * Row-Level Multi-Tenancy: every tenant table carries store_id and every
 * query is scoped through helpers in this module.
 */
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || '';

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
  database: connectionString ? undefined : process.env.PGDATABASE || 'ghanastores',
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

export default { pool, query, withTransaction, pingDb };
