/**
 * Explicitly destroy and recreate the configured database schema.
 * Requires RESET_DATABASE=yes to prevent accidental data loss.
 * Usage: RESET_DATABASE=yes npm run db:reset
 */
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();
const connectionString = process.env.DATABASE_URL || '';
if (process.env.RESET_DATABASE !== 'yes') {
  console.error('Refusing destructive reset. Set RESET_DATABASE=yes to continue.');
  process.exit(1);
}
if (!connectionString) {
  console.error('DATABASE_URL is required for db:reset.');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString, ssl: /neon\.tech|sslmode=require/i.test(connectionString) ? { rejectUnauthorized: false } : undefined });
try {
  console.log('Dropping public schema...');
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  console.log('Schema reset complete. Run npm run db:init next.');
} finally {
  await pool.end();
}
