/**
 * DiDwa - Create (or reset) a platform administrator
 *
 * Writes a bcrypt-hashed row into `platform_admins`, which is what
 * requireAdmin checks. Admins then sign in through POST /api/admin/login.
 *
 * Usage:
 *   node scripts/createAdmin.js admin@didwaghana.com "s3cret-passphrase" "Ops Lead"
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/createAdmin.js
 */
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { query, pool } from '../config/database.js';

dotenv.config();

const email = String(process.argv[2] || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = String(process.argv[3] || process.env.ADMIN_PASSWORD || '');
const name = String(process.argv[4] || process.env.ADMIN_NAME || 'Platform Admin').trim();

async function main() {
  if (!email || !password) {
    console.error('Usage: node scripts/createAdmin.js <email> <password> [name]');
    console.error('   or: ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/createAdmin.js');
    process.exitCode = 1;
    return;
  }
  if (password.length < 10) {
    console.error('Choose a password of at least 10 characters.');
    process.exitCode = 1;
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  const { rows } = await query(
    `INSERT INTO platform_admins (email, password_hash, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash,
                                       name = EXCLUDED.name
     RETURNING id, email, name`,
    [email, hash, name],
  );
  console.log(`Admin ready: ${rows[0].email} (${rows[0].id})`);
  console.log('Sign in with POST /api/admin/login to receive an ADMIN token.');
}

main()
  .catch((err) => {
    console.error('admin:create failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
