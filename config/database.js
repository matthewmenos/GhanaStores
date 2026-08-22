import { createPool } from '@vercel/postgres';
import dotenv from 'dotenv';

dotenv.config();

// Vercel's built-in Neon integration injects POSTGRES_URL (pooled, via
// PgBouncer) automatically into every environment — no manual wiring
// needed once the Neon storage integration is attached to the project.
// POSTGRES_URL_NON_POOLING is also available if a route ever needs a
// direct (non-pooled) connection, but everything here is short-lived
// serverless-function traffic, so the pooled URL is the right default.
if (!process.env.POSTGRES_URL) {
  console.error('[database] Missing POSTGRES_URL — attach the Neon Postgres storage integration in Vercel, or set it locally in .env.');
}

/**
 * Shared Postgres pool, backed by @vercel/postgres (which speaks the
 * Neon serverless driver over HTTP/WebSockets — safe to use from
 * short-lived Vercel serverless functions, unlike a long-lived `pg` pool).
 */
export const pool = createPool({
  connectionString: process.env.POSTGRES_URL,
});

/**
 * Run a query scoped to a store_id. Every tenant table carries a
 * store_id column — this helper makes it structurally hard to forget
 * the WHERE clause that enforces row-level multi-tenancy.
 *
 * @param {string} text - SQL with $1 reserved for store_id
 * @param {string} storeId
 * @param {any[]} extraParams - params starting at $2
 */
export async function queryForStore(text, storeId, extraParams = []) {
  if (!storeId) throw new Error('queryForStore called without a storeId');
  return pool.query(text, [storeId, ...extraParams]);
}

/**
 * Run a callback inside a transaction with a checked-out client.
 * Use this for anything touching wallet balances (payouts, POS sales,
 * rider reconciliation) where row-locking (FOR UPDATE) matters.
 */
export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default pool;
