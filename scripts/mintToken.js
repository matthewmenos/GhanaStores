/**
 * DiDwa - JWT Mint Helper
 * Issues a signed seller (or platform admin) token using the SAME code
 * path as the running app (issueStoreToken / issueAdminToken), so the
 * claims and signature always match production.
 *
 * Usage:
 *   node scripts/mintToken.js seller demo@didwa.com
 *   node scripts/mintToken.js admin
 *   (omit role to default to SELLER)
 *
 * Loads JWT_SECRET from .env / process env. Output is plain text suitable
 * for Authorization: Bearer <token>.
 */
import dotenv from 'dotenv';
import { query } from '../config/database.js';
import { issueStoreToken, issueAdminToken } from '../middleware/authMiddleware.js';

dotenv.config();

const role = String(process.argv[2] || 'seller').toUpperCase();
const email = process.argv[3];

if (!process.env.JWT_SECRET) {
  console.warn('[mint] WARNING: JWT_SECRET not set — token will be signed with the dev default.');
  console.warn('[mint] Set JWT_SECRET in .env (or Vercel env vars) before going live.\n');
}

if (role === 'ADMIN') {
  // requireAdmin checks the token subject against platform_admins, so the
  // token must carry a real administrator row (create one with
  // `npm run admin:create`). The email argument is optional.
  const adminEmail = String(email || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const { rows } = adminEmail
    ? await query(
      `SELECT id, email, name FROM platform_admins WHERE LOWER(email) = $1 LIMIT 1`,
      [adminEmail],
    )
    : await query(`SELECT id, email, name FROM platform_admins ORDER BY created_at ASC LIMIT 1`);

  const admin = rows[0];
  if (!admin) {
    console.error('No platform administrator found.');
    console.error('Create one first:  npm run admin:create -- admin@didwaghana.com "long-passphrase" "Ops Lead"');
    process.exit(1);
  }

  const token = issueAdminToken(admin);
  console.log(`\nADMIN: ${admin.name || 'Platform Admin'} <${admin.email}> (${admin.id})`);
  console.log('ADMIN_TOKEN (expires in 7d):\n' + token + '\n');
  console.log('Prefer POST /api/admin/login for day-to-day access - minting is for ops tooling.');
  process.exit(0);
}

if (!email) {
  console.error('Usage: node scripts/mintToken.js seller <email>');
  process.exit(1);
}

const { rows } = await query(
  `SELECT id, email, name, subdomain_slug, status
     FROM stores WHERE LOWER(email) = $1 LIMIT 1`,
  [String(email).trim().toLowerCase()],
);
const store = rows[0];
if (!store) {
  console.error(`No store found for email: ${email}`);
  process.exit(1);
}

const token = issueStoreToken(store);
console.log(`\nSTORE:   ${store.name} (${store.email})`);
console.log(`  id       : ${store.id}`);
console.log(`  status   : ${store.status}`);
console.log(`  slug     : ${store.subdomain_slug}`);
console.log(`  expires  : 7 days\n`);
console.log(`SELLER_TOKEN:\n${token}\n`);
console.log(`Usage: ${process.env.CLIENT_URL || 'http://localhost:5173'} → Authorization: Bearer <token>`);