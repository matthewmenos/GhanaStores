import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../config/database.js';
import { requireSellerAuth, requireActiveSubscription } from '../middleware/authMiddleware.js';
import { sendSms, templates } from '../services/smsService.js';

const router = Router();

const variantSchema = z.object({
  sku: z.string().min(1),
  optionLabel: z.string().min(1), // e.g. "Size: L / Color: Red"
  price: z.number().positive(),
  quantityOnHand: z.number().int().min(0).default(0),
  reorderThreshold: z.number().int().min(0).default(5),
});

const productSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  imageUrl: z.string().url().optional(),
  variants: z.array(variantSchema).min(1),
});

/**
 * GET /api/inventory/products
 * Lists products with their variants, flagging any variant below its
 * reorder threshold so SellerInventory.jsx can render the amber badge.
 */
router.get('/products', requireSellerAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.description, p.category, p.image_url, p.is_active,
              COALESCE(json_agg(
                json_build_object(
                  'id', v.id, 'sku', v.sku, 'optionLabel', v.option_label,
                  'price', v.price, 'quantityOnHand', v.quantity_on_hand,
                  'reorderThreshold', v.reorder_threshold,
                  'isLowStock', v.quantity_on_hand <= v.reorder_threshold
                ) ORDER BY v.option_label
              ) FILTER (WHERE v.id IS NOT NULL), '[]') AS variants
       FROM products p
       LEFT JOIN product_variants v ON v.product_id = p.id
       WHERE p.store_id = $1
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [req.auth.storeId]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/inventory/products
 * Creates a product with one or more variants.
 */
router.post('/products', requireSellerAuth, requireActiveSubscription, async (req, res, next) => {
  try {
    const input = productSchema.parse(req.body);

    const product = await withTransaction(async (client) => {
      const { rows: productRows } = await client.query(
        `INSERT INTO products (store_id, name, description, category, image_url)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, name`,
        [req.auth.storeId, input.name, input.description || null, input.category || null, input.imageUrl || null]
      );
      const productId = productRows[0].id;

      for (const v of input.variants) {
        await client.query(
          `INSERT INTO product_variants
             (product_id, store_id, sku, option_label, price, quantity_on_hand, reorder_threshold)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [productId, req.auth.storeId, v.sku, v.optionLabel, v.price, v.quantityOnHand, v.reorderThreshold]
        );
      }

      return productRows[0];
    });

    res.status(201).json(product);
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    next(err);
  }
});

/**
 * PATCH /api/inventory/variants/:variantId/stock
 * Adjusts stock (e.g. after a restock or manual correction) and fires
 * a low-stock SMS via Arkesel if the new quantity crosses the threshold.
 */
router.patch('/variants/:variantId/stock', requireSellerAuth, requireActiveSubscription, async (req, res, next) => {
  try {
    const { quantityOnHand } = z.object({ quantityOnHand: z.number().int().min(0) }).parse(req.body);

    const { rows } = await pool.query(
      `UPDATE product_variants v
       SET quantity_on_hand = $3
       FROM products p
       WHERE v.id = $1 AND v.store_id = $2 AND p.id = v.product_id
       RETURNING v.id, v.option_label, v.quantity_on_hand, v.reorder_threshold, p.name AS product_name`,
      [req.params.variantId, req.auth.storeId, quantityOnHand]
    );

    const variant = rows[0];
    if (!variant) return res.status(404).json({ error: 'Variant not found.' });

    await maybeTriggerLowStockAlert(req.auth.storeId, variant);

    res.json(variant);
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    next(err);
  }
});

/**
 * Fires an Arkesel low-stock SMS at most once per threshold breach —
 * we stamp low_stock_alerted_at so decrementing stock further doesn't
 * spam the merchant on every single sale.
 */
export async function maybeTriggerLowStockAlert(storeId, variant) {
  if (variant.quantity_on_hand > variant.reorder_threshold) {
    // Stock recovered above threshold — clear the alert stamp so a future
    // dip triggers a fresh SMS.
    await pool.query(`UPDATE product_variants SET low_stock_alerted_at = NULL WHERE id = $1`, [variant.id]);
    return;
  }

  const { rows } = await pool.query(
    `SELECT s.phone, s.store_name, v.low_stock_alerted_at
     FROM stores s, product_variants v
     WHERE s.id = $1 AND v.id = $2`,
    [storeId, variant.id]
  );
  const { phone, low_stock_alerted_at } = rows[0];
  if (low_stock_alerted_at) return; // already alerted for this breach

  await sendSms({
    storeId,
    toPhone: phone,
    purpose: 'LOW_STOCK',
    message: templates.lowStock(variant.product_name, variant.option_label, variant.quantity_on_hand),
  });

  await pool.query(`UPDATE product_variants SET low_stock_alerted_at = now() WHERE id = $1`, [variant.id]);
}

export default router;
