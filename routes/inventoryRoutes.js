/**
 * Ghana Stores - Multi-Variant Inventory Routes
 * MODULE 6: Product + variant CRUD, custom re-order thresholds, stock
 * adjustments with automatic Arkesel low-stock SMS alerts.
 */
import { Router } from 'express';
import { query, withTransaction } from '../config/database.js';
import { requireSeller } from '../middleware/authMiddleware.js';
import { sendLowStockAlertSms } from '../services/smsService.js';
import { money } from '../utils/helpers.js';

const router = Router();

/**
 * Shared low-stock evaluation used by BOTH inventory adjustments and POS sales.
 * Runs inside an open transaction `t`. After decrementing a variant:
 *  - stock <= threshold AND alert not yet sent -> flag for SMS + mark sent
 *  - stock > threshold -> reset the alert flag so future drops re-alert
 * Returns the variant row if an SMS should fire (caller dispatches after COMMIT).
 */
export function collectLowStockCandidate(variantRow) {
  const stock = Number(variantRow.stock_quantity);
  const threshold = Number(variantRow.low_stock_threshold);
  if (stock <= threshold && !variantRow.low_stock_alert_sent) {
    return true; // needs alert
  }
  return false;
}

export async function persistAlertFlag(t, variantId, sent) {
  await t.query(
    'UPDATE product_variants SET low_stock_alert_sent = $2, updated_at = NOW() WHERE id = $1',
    [variantId, sent],
  );
}

/* ------------------------------ Products listing ----------------------------- */
router.get('/products', requireSeller, async (req, res, next) => {
  try {
    const search = String(req.query.q || '').trim();
    const params = [req.auth.sub];
    let where = 'p.store_id = $1';
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (p.name ILIKE $${params.length} OR p.category ILIKE $${params.length})`;
    }
    const { rows } = await query(
      `SELECT p.id, p.name, p.description, p.category, p.image_url, p.is_active,
              p.created_at,
              COALESCE(json_agg(
                json_build_object(
                  'id', v.id,
                  'optionName', v.option_name,
                  'optionValue', v.option_value,
                  'sku', v.sku,
                  'priceOverride', v.price_override,
                  'stockQuantity', v.stock_quantity,
                  'lowStockThreshold', v.low_stock_threshold,
                  'lowStockAlertSent', v.low_stock_alert_sent
                ) ORDER BY v.option_name, v.option_value
              ) FILTER (WHERE v.id IS NOT NULL), '[]') AS variants
         FROM products p
         LEFT JOIN product_variants v ON v.product_id = p.id
        WHERE ${where}
        GROUP BY p.id
        ORDER BY p.created_at DESC
        LIMIT 200`,
      params,
    );
    res.json({ products: rows });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ Create product ------------------------------- */
router.post('/products', requireSeller, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.price) {
      return res.status(400).json({ error: 'Product name and base price are required.' });
    }
    const price = money(b.price);
    const variants = Array.isArray(b.variants) && b.variants.length > 0
      ? b.variants
      : [{ optionName: 'Default', optionValue: 'Standard' }];

    const alertCandidates = [];
    const result = await withTransaction(async (t) => {
      const prod = await t.query(
        `INSERT INTO products (store_id, name, description, category, image_url, price)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name`,
        [req.auth.sub, String(b.name).trim(), b.description || '', b.category || 'General',
          b.imageUrl || null, price],
      );
      const productId = prod.rows[0].id;
      for (const v of variants) {
        const qty = Math.max(0, parseInt(v.stockQuantity ?? 0, 10) || 0);
        const threshold = Math.max(0, parseInt(v.lowStockThreshold ?? 5, 10) || 0);
        // A variant created already at/below its threshold arms the alert latch.
        const ins = await t.query(
          `INSERT INTO product_variants
             (store_id, product_id, option_name, option_value, sku,
              price_override, stock_quantity, low_stock_threshold, low_stock_alert_sent)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING id, option_value`,
          [
            req.auth.sub, productId,
            String(v.optionName || 'Default').trim(),
            String(v.optionValue || 'Standard').trim(),
            v.sku || null,
            v.priceOverride != null ? money(v.priceOverride) : null,
            qty, threshold, qty <= threshold,
          ],
        );
        if (qty <= threshold) {
          alertCandidates.push({
            id: ins.rows[0].id,
            product_name: String(b.name).trim(),
            option_value: ins.rows[0].option_value,
            stock_quantity: qty,
          });
        }
      }
      return prod.rows[0];
    });

    // Dispatch alerts AFTER commit so SMS never rolls back catalog writes.
    if (alertCandidates.length > 0) {
      const storeRes = await query('SELECT name, phone FROM stores WHERE id = $1', [req.auth.sub]);
      sendLowStockAlertSms(storeRes.rows[0], alertCandidates).catch(() => {});
    }

    res.status(201).json({ message: 'Product added to catalog.', product: result });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ Update product ------------------------------- */
router.put('/products/:id', requireSeller, async (req, res, next) => {
  try {
    const b = req.body || {};
    const { rows } = await query(
      `UPDATE products
          SET name = COALESCE($3, name),
              description = COALESCE($4, description),
              category = COALESCE($5, category),
              image_url = COALESCE($6, image_url),
              is_active = COALESCE($7, is_active),
              updated_at = NOW()
        WHERE id = $1 AND store_id = $2
        RETURNING id, name, is_active`,
      [req.params.id, req.auth.sub,
        b.name ? String(b.name).trim() : null,
        b.description ?? null,
        b.category ?? null,
        b.imageUrl ?? null,
        typeof b.isActive === 'boolean' ? b.isActive : null],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Product not found.' });
    res.json({ message: 'Product updated.', product: rows[0] });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------- Add variant -------------------------------- */
router.post('/products/:id/variants', requireSeller, async (req, res, next) => {
  try {
    const v = req.body || {};
    const owner = await query(
      'SELECT 1 FROM products WHERE id = $1 AND store_id = $2',
      [req.params.id, req.auth.sub],
    );
    if (owner.rows.length === 0) return res.status(404).json({ error: 'Product not found.' });

    const { rows } = await query(
      `INSERT INTO product_variants
         (store_id, product_id, option_name, option_value, sku, price_override,
          stock_quantity, low_stock_threshold)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, option_name, option_value, stock_quantity`,
      [req.auth.sub, req.params.id,
        String(v.optionName || 'Default').trim(),
        String(v.optionValue || 'Standard').trim(),
        v.sku || null,
        v.priceOverride != null ? money(v.priceOverride) : null,
        Math.max(0, parseInt(v.stockQuantity ?? 0, 10) || 0),
        Math.max(0, parseInt(v.lowStockThreshold ?? 5, 10) || 0)],
    );
    // A freshly stocked variant above threshold resets any stale alert flag.
    await query(
      `UPDATE product_variants SET low_stock_alert_sent = FALSE WHERE id = $1`,
      [rows[0].id],
    );
    res.status(201).json({ message: 'Variant added.', variant: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'This variant option already exists on the product.' });
    }
    next(err);
  }
});

/* --------------------- Adjust variant stock (restock / fix) ------------------- */
// body: { delta } for +/- adjustment or { quantity } to set absolute count.
router.patch('/variants/:id/stock', requireSeller, async (req, res, next) => {
  try {
    const delta = req.body?.delta != null ? parseInt(req.body.delta, 10) : null;
    const absolute = req.body?.quantity != null ? parseInt(req.body.quantity, 10) : null;
    if (delta == null && absolute == null) {
      return res.status(400).json({ error: 'Provide either `delta` or `quantity`.' });
    }

    let smsCandidate = null;
    const updated = await withTransaction(async (t) => {
      const lock = await t.query(
        `SELECT * FROM product_variants
          WHERE id = $1 AND store_id = $2 FOR UPDATE`,
        [req.params.id, req.auth.sub],
      );
      const variant = lock.rows[0];
      if (!variant) throw Object.assign(new Error('Variant not found.'), { status: 404 });

      let newQty = Number(variant.stock_quantity);
      if (absolute != null) newQty = Math.max(0, absolute);
      else newQty = Math.max(0, newQty + delta);

      const resUpd = await t.query(
        `UPDATE product_variants
            SET stock_quantity = $2, updated_at = NOW(),
                low_stock_alert_sent = CASE WHEN $2 > low_stock_threshold THEN FALSE
                                            ELSE low_stock_alert_sent END
          WHERE id = $1
          RETURNING id, option_name, option_value, stock_quantity, low_stock_threshold, low_stock_alert_sent`,
        [req.params.id, newQty],
      );
      const row = resUpd.rows[0];

      // Restock recovery clears the alert latch; a fresh drop below threshold re-arms it.
      if (Number(row.stock_quantity) <= Number(row.low_stock_threshold) && !row.low_stock_alert_sent) {
        await persistAlertFlag(t, row.id, true);
        smsCandidate = row;
      }
      return row;
    });

    // Dispatch alert AFTER commit so SMS never rolls back paid stock writes.
    if (smsCandidate) {
      const storeRes = await query('SELECT name, phone FROM stores WHERE id = $1', [req.auth.sub]);
      sendLowStockAlertSms(storeRes.rows[0], [
        { ...smsCandidate, product_name: 'Variant' },
      ]).catch(() => {});
    }

    res.json({
      message: `Stock updated to ${updated.stock_quantity}.`,
      variant: {
        id: updated.id,
        optionName: updated.option_name,
        optionValue: updated.option_value,
        sku: null,
        stockQuantity: Number(updated.stock_quantity),
        lowStockThreshold: Number(updated.low_stock_threshold),
        lowStockAlertSent: updated.low_stock_alert_sent,
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ Low-stock report ------------------------------ */
router.get('/low-stock', requireSeller, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT v.id, p.name AS product_name, v.option_name, v.option_value, v.sku,
              v.stock_quantity, v.low_stock_threshold
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
        WHERE v.store_id = $1
          AND v.stock_quantity <= v.low_stock_threshold
        ORDER BY (v.stock_quantity::float / GREATEST(v.low_stock_threshold, 1)) ASC
        LIMIT 100`,
      [req.auth.sub],
    );
    res.json({ lowStock: rows });
  } catch (err) {
    next(err);
  }
});

export default router;

