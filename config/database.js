import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  // Fail loudly at boot rather than on the first query
  console.error('[database] Missing DATABASE_URL — check your .env file.');
}

/**
 * Shared Neon PostgreSQL connection pool.
 * Neon's pooled connection string already load-balances at the edge,
 * so we keep this pool small and let Neon handle scaling.
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[database] Unexpected error on idle client', err);
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
