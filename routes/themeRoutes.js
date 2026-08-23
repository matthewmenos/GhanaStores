/**
 * Ghana Stores - Storefront Theme API Routes (Module: theme architecture).
 *
 *  GET /api/themes                      catalog of all seeded theme templates
 *  GET /api/store/theme/public/:slug    active theme config for a customer storefront (no auth)
 *  PUT /api/store/theme                 seller activates + customizes their store theme
 */
import { Router } from 'express';
import { query } from '../config/database.js';
import { requireSeller } from '../middleware/authMiddleware.js';

const router = Router();

/**
 * Recursively merge theme config with per-store overrides.
 * Nested objects merge; scalars (and nulls) from `override` win.
 */
function mergeConfig(base, override) {
  if (base == null || typeof base !== 'object') return override;
  if (override == null || typeof override !== 'object') return override;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(override || {})) {
    out[k] = mergeConfig(base[k], override[k]);
  }
  return out;
}

/* ----------------------------- Catalog (seller browsing) ------------------- */
// GET /api/themes  - all 100+ templates, sorted by category for the dashboard grid
router.get('/themes', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, name, category, config, created_at
         FROM theme_templates
        ORDER BY category ASC, name ASC`,
    );
    res.json({
      themes: rows.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        config: r.config,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ Public storefront -------------------------- */
// GET /api/store/theme/public/:slug  - active theme for a customer browsing a storefront
router.get('/store/theme/public/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { rows } = await query(
      `SELECT s.name              AS store_name,
              s.subdomain_slug    AS slug,
              s.custom_domain,
              s.active_theme_id   AS theme_id,
              t.name              AS theme_name,
              t.category          AS theme_category,
              t.config            AS base_config,
              s.custom_theme_config
        FROM stores s
        LEFT JOIN theme_templates t ON t.id = s.active_theme_id
       WHERE s.subdomain_slug = $1
          OR s.custom_domain = $1
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [slug],
    );

    const store = rows[0];
    if (!store) {
      return res.status(404).json({ error: 'Store not found for this theme.' });
    }

    const merged = mergeConfig(store.base_config || {}, store.custom_theme_config || {});
    res.json({
      storeName: store.store_name,
      slug: store.slug,
      customDomain: store.custom_domain,
      theme: {
        id: store.theme_id,
        name: store.theme_name,
        category: store.theme_category,
        config: merged,
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ Seller mutation ----------------------------- */
// PUT /api/store/theme  - seller activates a theme and/or saves custom overrides
router.put('/store/theme', requireSeller, async (req, res, next) => {
  try {
    const { active_theme_id, custom_theme_config } = req.body || {};
    const storeId = req.auth.sub;

    if (active_theme_id !== undefined && active_theme_id !== null) {
      const exists = await query('SELECT 1 FROM theme_templates WHERE id = $1', [active_theme_id]);
      if (!exists.rowCount) {
        return res.status(400).json({ error: `theme_templates id not found: ${active_theme_id}` });
      }
    }

    const setParts = [];
    const params = [];
    let idx = 1;
    if (active_theme_id !== undefined && active_theme_id !== null) {
      setParts.push(`active_theme_id = $${idx++}`);
      params.push(active_theme_id);
    }
    if (custom_theme_config !== undefined) {
      setParts.push(`custom_theme_config = $${idx++}`);
      params.push(custom_theme_config);
    }
    if (setParts.length === 0) {
      return res.status(400).json({ error: 'Provide active_theme_id and/or custom_theme_config.' });
    }
    params.push(storeId);

    await query(
      `UPDATE stores SET ${setParts.join(', ')}
        WHERE id = $${idx}
        RETURNING active_theme_id`,
      params,
    );

    // Return the effective resolved theme (base + overrides merged).
    const { rows } = await query(
      `SELECT t.id        AS theme_id,
              t.name      AS theme_name,
              t.category  AS theme_category,
              t.config    AS base_config,
              s.custom_theme_config
         FROM stores s
         LEFT JOIN theme_templates t ON t.id = s.active_theme_id
        WHERE s.id = $1`,
      [storeId],
    );
    const row = rows[0];
    const merged = mergeConfig(row?.base_config || {}, row?.custom_theme_config || {});

    res.json({
      message: 'Store theme updated.',
      activeThemeId: row?.theme_id || null,
      theme: row
        ? {
            id: row.theme_id,
            name: row.theme_name,
            category: row.theme_category,
            config: merged,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
