/**
 * Apply db/schema.sql to the configured database (Neon or local Postgres).
 * Usage: npm run db:init
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Schema + supplemental modules, applied in dependency order.
const schemaFiles = [
  path.join(__dirname, '..', 'db', 'schema.sql'),
  path.join(__dirname, '..', 'db', 'variants_and_alerts.sql'),
  path.join(__dirname, '..', 'sql', 'orders_schema.sql'),
];

const connectionString = process.env.DATABASE_URL || '';
const useSsl = /\.neon\.tech/i.test(connectionString) ||
  /sslmode=require/i.test(connectionString) ||
  String(process.env.PGSSL || '').toLowerCase() === 'true';

async function main() {
  if (!connectionString && !process.env.PGHOST) {
    console.error('No DATABASE_URL/PGHOST configured. Copy .env.example to .env first.');
    process.exit(1);
  }
  const pool = new pg.Pool({
    connectionString: connectionString || undefined,
    host: connectionString ? undefined : (process.env.PGHOST || 'localhost'),
    port: connectionString ? undefined : Number(process.env.PGPORT || 5432),
    user: connectionString ? undefined : (process.env.PGUSER || 'postgres'),
    password: connectionString ? undefined : (process.env.PGPASSWORD || 'postgres'),
    database: connectionString ? undefined : (process.env.PGDATABASE || 'didwa'),
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });

  for (const schemaPath of schemaFiles) {
    const sql = fs.readFileSync(schemaPath, 'utf8');
    console.log(`Applying ${schemaPath} ...`);
    try {
      await pool.query(sql);
      console.log('Schema applied successfully.');
    } catch (err) {
      // Neon pooled connections sometimes reject multi-statement payloads;
      // fall back to statement-by-statement execution.
      console.warn(`Bulk apply failed (${err.message.split('\n')[0]}). Retrying statement-by-statement...`);
      const statements = sql
        .split(/;\s*$/m)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--'));
      let applied = 0;
      for (const stmt of statements) {
        try {
          await pool.query(stmt.endsWith(';') ? stmt : `${stmt};`);
          applied += 1;
        } catch (e) {
          console.warn(`  skipped: ${e.message.split('\n')[0]}`);
        }
      }
      console.log(`Applied ${applied}/${statements.length} statements.`);
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error('db:init failed:', err.message);
  process.exit(1);
});
