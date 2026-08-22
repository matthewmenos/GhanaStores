import { Router } from 'express';
import { z } from 'zod';
import { withTransaction, pool } from '../config/database.js';
import { requireSellerAuth, requireRole, requireActiveSubscription } from '../middleware/authMiddleware.js';
import { maybeTriggerLowStockAlert } from './inventoryRoutes.js';

const router = Router();

const posSaleSchema = z.object({
  items: z.array(z.object({
    variantId: z.string().uuid(),
    quantity: z.number().int().positive(),
  })).min(1),
  paymentMethod: z.enum(['CASH', 'MOMO']),
  customerPhone: z.string().optional(),
  riderStaffId: z.string().uuid().optional(), // set when a rider is fulfilling COD
});

/**
 * POST /api/pos/sales
 * Logs an in-store (or rider COD) sale, decrementing inventory inside
 * the same transaction so stock never drifts out of sync with sales.
 * Cash sales attributed to a rider land in rider_transit_balance rather
 * than available_balance until the rider reconciles.
 */
router.post('/sales', requireSellerAuth, requireRole('OWNER', 'MANAGER', 'CASHIER', 'RIDER'), requireActiveSubscription, async (req, res, next) => {
  try {
    const input = posSaleSchema.parse(req.body);
    const storeId = req.auth.storeId;

    const result = await withTransaction(async (client) => {
      let subtotal = 0;
      const lineItems = [];

      for (const item of input.items) {
        const { rows } = await client.query(
          `SELECT id, price, quantity_on_hand, product_id
           FROM product_variants
           WHERE id = $1 AND store_id = $2
           FOR UPDATE`,
          [item.variantId, storeId]
        );
        const variant = rows[0];
        if (!variant) throw httpError(404, `Variant ${item.variantId} not found.`);
        if (variant.quantity_on_hand < item.quantity) {
          throw httpError(409, `Insufficient stock for variant ${item.variantId}.`);
        }

        await client.query(
          `UPDATE product_variants SET quantity_on_hand = quantity_on_hand - $1 WHERE id = $2`,
          [item.quantity, variant.id]
        );

        subtotal += Number(variant.price) * item.quantity;
        lineItems.push({ ...item, unitPrice: variant.price });
      }

      const { rows: orderRows } = await client.query(
        `INSERT INTO orders (store_id, channel, status, payment_method, subtotal, total, rider_staff_id, rider_collected_cash)
         VALUES ($1, 'POS', 'PAID', $2, $3, $3, $4, $5)
         RETURNING id, created_at`,
        [storeId, input.paymentMethod, subtotal, input.riderStaffId || null,
         Boolean(input.riderStaffId && input.paymentMethod === 'CASH')]
      );
      const order = orderRows[0];

      for (const li of lineItems) {
        await client.query(
          `INSERT INTO order_items (order_id, variant_id, quantity, unit_price) VALUES ($1, $2, $3, $4)`,
          [order.id, li.variantId, li.quantity, li.unitPrice]
        );
      }

      // Route funds: rider-collected cash goes to transit balance pending
      // reconciliation; everything else lands directly in available balance.
      const isRiderCash = input.riderStaffId && input.paymentMethod === 'CASH';
      await client.query(
        `UPDATE store_wallets
         SET ${isRiderCash ? 'rider_transit_balance' : 'available_balance'} =
             ${isRiderCash ? 'rider_transit_balance' : 'available_balance'} + $2,
             updated_at = now()
         WHERE store_id = $1`,
        [storeId, subtotal]
      );

      return { orderId: order.id, createdAt: order.created_at, total: subtotal, lineItems };
    });

    // Fire low-stock checks after the transaction commits (best-effort, non-blocking)
    for (const li of result.lineItems) {
      pool.query(
        `SELECT v.id, v.option_label, v.quantity_on_hand, v.reorder_threshold, p.name AS product_name
         FROM product_variants v JOIN products p ON p.id = v.product_id
         WHERE v.id = $1`,
        [li.variantId]
      ).then(({ rows }) => rows[0] && maybeTriggerLowStockAlert(storeId, rows[0]))
        .catch((e) => console.error('[posRoutes] low-stock check failed:', e.message));
    }

    res.status(201).json(result);
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

/**
 * GET /api/pos/rider-transit-balance
 * Shows cash currently sitting with riders, awaiting reconciliation.
 */
router.get('/rider-transit-balance', requireSellerAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT rider_transit_balance FROM store_wallets WHERE store_id = $1`,
      [req.auth.storeId]
    );
    res.json({ riderTransitBalance: Number(rows[0]?.rider_transit_balance || 0) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/pos/reconcile-rider
 * One-click transfer of the full rider transit balance into available
 * balance, once a rider hands in their cash collections at end-of-day.
 */
router.post('/reconcile-rider', requireSellerAuth, requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
  try {
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT rider_transit_balance FROM store_wallets WHERE store_id = $1 FOR UPDATE`,
        [req.auth.storeId]
      );
      const amount = Number(rows[0].rider_transit_balance);

      await client.query(
        `UPDATE store_wallets
         SET available_balance = available_balance + $2,
             rider_transit_balance = 0,
             updated_at = now()
         WHERE store_id = $1`,
        [req.auth.storeId, amount]
      );

      await client.query(
        `UPDATE orders SET rider_reconciled_at = now()
         WHERE store_id = $1 AND rider_collected_cash = TRUE AND rider_reconciled_at IS NULL`,
        [req.auth.storeId]
      );

      return { reconciledAmount: amount };
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

export default router;
