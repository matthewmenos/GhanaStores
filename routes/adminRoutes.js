/**
 * DiDwa - Platform Admin Routes
 *
 *   POST /api/admin/login   email + password -> ADMIN token (platform_admins)
 *   GET  /api/admin/me      current admin profile
 *   POST /api/admin/admins  create another administrator (existing admin only)
 *
 * Admins authenticate against the `platform_admins` table (bcrypt hashes)
 * instead of a hand-minted token, and requireAdmin re-checks that the token
 * subject still exists - so admin access can be revoked server-side.
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/database.js';
import { issueAdminToken, requireAdmin } from '../middleware/authMiddleware.js';

const router = Router();

const publicAdmin = (row) => ({
  id: row.id,
  email: row.email,
  name: row.name,
  createdAt: row.created_at,
});

/* ----------------------------------- Login --------------------------------- */
router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const { rows } = await query(
      'SELECT id, email, name, password_hash, created_at FROM platform_admins WHERE LOWER(email) = $1 LIMIT 1',
      [email],
    );
    const admin = rows[0];
    // Same generic message for unknown email and bad password (no enumeration).
    if (!admin) return res.status(401).json({ error: 'Invalid email or password.' });

    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });

    res.json({ token: issueAdminToken(admin), admin: publicAdmin(admin) });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------ Me ----------------------------------- */
router.get('/me', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, email, name, created_at FROM platform_admins WHERE id = $1 LIMIT 1',
      [req.auth.sub],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Administrator not found.' });
    res.json({ admin: publicAdmin(rows[0]) });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ Create admin ------------------------------- */
router.post('/admins', requireAdmin, async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const name = req.body?.name ? String(req.body.name).trim() : null;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    if (password.length < 10) {
      return res.status(400).json({ error: 'Admin passwords must be at least 10 characters.' });
    }

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await query(
      `INSERT INTO platform_admins (email, password_hash, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash,
                                         name = COALESCE(EXCLUDED.name, platform_admins.name)
       RETURNING id, email, name, created_at`,
      [email, hash, name],
    );
    res.status(201).json({ message: 'Administrator saved.', admin: publicAdmin(rows[0]) });
  } catch (err) {
    next(err);
  }
});

export default router;
