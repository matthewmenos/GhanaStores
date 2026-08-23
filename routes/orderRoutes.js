/**
 * Ghana Stores - Order Management Module
 * Public storefront checkout + seller fulfillment console.
 *
 *   POST  /api/public/orders              guest checkout (transactional)
 *   GET   /api/seller/orders              status-filtered feed, JSON_AGG items
 *   PATCH /api/seller/orders/:id/status   fulfillment transitions
 *
 * Auth note: the platform guard lives at requireSeller in
 * middleware/authMiddleware.js; aliased to authenticateSeller below to
 * match this module's contract.
 */
import { Router } from 'express';
import { query, withTransaction } from '../config/database.js';
import { requireSeller as authenticateSeller } from '../middleware/authMiddleware.js';
import { generateOrderNumber, money, toIntOr } from '../utils/helpers.js';
import {
  collectLowStockCandidate,
  persistAlertFlag,
  recordLowStockAlerts,
} from './inventoryRoutes.js';
import { sendLowStockAlertSms } from '../services/smsService.js';

const router = Router();

const ORDER_STATUSES = ['PENDING', 'PROCESSING', 'DELIVERED', 'CANCELLED'];
const PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED'];
const PAYMENT_METHODS = ['COD', 'MOMO', 'BANK_TRANSFER'];

/* ------------------------------- Guest checkout ---------------------------- */
// POST /api/public/orders - called by customer storefronts upon checkout.
// Wraps pricing + order/items creation + stock decrement in one transaction.
router.post('/public/orders', async (req, res, next) => {
  try {
    const b = req.body || {};
    const rawItems = Array.isArray(b.items) ? b.items : [];
    const customerName = String(b.customer_name ?? b.customerName ?? '').trim();
    const customerPhone = String(b.customer_phone ?? b.customerPhone ?? '').trim();
    const customerAddress = String(b.customer_address ?? b.customerAddress ?? '').trim();
    const methodRaw = String(b.payment_method ?? b.paymentMethod ?? 'COD').toUpperCase();
    const paymentMethod = PAYMENT_METHODS.includes(methodRaw) ? methodRaw : 'COD';
    const notes = b.notes ? String(b.notes).slice(0, 500) : null;

    if (!customerName || !customerPhone || !customerAddress) {
      return res.status(400).json({ error: 'Customer name, phone and delivery address are required.' });
    }
    if (rawItems.length === 0) {
      return res.status(400).json({ error: 'Your cart is empty.' });
    }

    // Multi-tenant scope: explicit store_id (embedded widget) or storefront slug.
    let storeId = b.store_id ?? b.storeId ?? null;
    if (!storeId && b.slug) {
      const s = await query(
        'SELECT id FROM stores WHERE subdomain_slug = $1 OR custom_domain = $1 LIMIT 1',
        [String(b.slug)],
      );
      if (!s.rows[0]) return res.status(404).json({ error: 'Store not found.' });
      storeId = s.rows[0].id;
    }
    if (!storeId) {
      return res.status(400).json({ error: 'Store context missing: provide store_id or slug.' });
    }

    const items = rawItems
      .map((it) => ({
        variantId: it.variant_id ?? it.variantId ?? null,
        productId: it.product_id ?? it.productId ?? null,
        quantity: toIntOr(it.quantity ?? it.qty, 0),
      }))
      .filter((it) => it.quantity > 0);
    if (items.length === 0) {
      return res.status(400).json({ error: 'Cart quantities must be at least 1.' });
    }

    const alertCandidates = [];
    const created = await withTransaction(async (t) => {
      const orderRow = await t.query(
        `INSERT INTO orders
            (store_id, order_number, customer_name, customer_phone, customer_address,
             payment_method, payment_status, order_status, total_amount, notes)
         VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 'PENDING', 0, $7)
         RETURNING id, order_number, created_at`,
        [storeId, generateOrderNumber(), customerName, customerPhone, customerAddress, paymentMethod, notes],
      );
      const order = orderRow.rows[0];
      let totalAmount = 0;

      for (const it of items) {
        // Tenant-scoped lock + pricing derived from catalog truth.
        const found = await t.query(
          `SELECT v.id, v.product_id, p.name AS product_name,
                  COALESCE(v.price_override, p.price) AS unit_price,
                  v.stock_quantity
             FROM product_variants v
             JOIN products p ON p.id = v.product_id
            WHERE v.store_id = $2
              AND ($1::uuid IS NULL OR v.id = $1::uuid)
              AND ($3::uuid IS NULL OR p.id = $3::uuid)
            ORDER BY v.id
            LIMIT 1
            FOR UPDATE OF v`,
          [it.variantId, storeId, it.productId],
        );
        const row = found.rows[0];
        if (!row) {
          throw Object.assign(new Error('An item in your cart is no longer available.'), { status: 404 });
        }
        if (Number(row.stock_quantity) < it.quantity) {
          throw Object.assign(
            new Error(`${row.product_name} has only ${row.stock_quantity} left in stock.`),
            { status: 409, code: 'INSUFFICIENT_STOCK' },
          );
        }

        const unitPrice = money(row.unit_price);
        const lineTotal = money(unitPrice * it.quantity);
        totalAmount = money(totalAmount + Number(lineTotal));

        await t.query(
          `INSERT INTO order_items
              (order_id, store_id, product_id, variant_id, product_name,
               quantity, unit_price, total_price, line_total)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
          [order.id, storeId, row.product_id, row.id, row.product_name, it.quantity, unitPrice, lineTotal],
        );

        const dec = await t.query(
          `UPDATE product_variants
              SET stock_quantity = stock_quantity - $2, updated_at = NOW()
            WHERE id = $1
            RETURNING id, stock_quantity, low_stock_threshold, low_stock_alert_sent`,
          [row.id, it.quantity],
        );
        const after = dec.rows[0];
        if (collectLowStockCandidate(after)) {
          await persistAlertFlag(t, after.id, true);
          alertCandidates.push({
            id: after.id,
            product_name: row.product_name,
            stock_quantity: after.stock_quantity,
            low_stock_threshold: after.low_stock_threshold,
          });
        }
      }

      await t.query(
        'UPDATE orders SET total_amount = $2, updated_at = NOW() WHERE id = $1',
        [order.id, totalAmount],
      );
      return { ...order, totalAmount };
    });

    // Post-commit side effects - an SMS hiccup must never roll back stock.
    if (alertCandidates.length > 0) {
      const storeRes = await query('SELECT name, phone FROM stores WHERE id = $1', [storeId]);
      sendLowStockAlertSms(storeRes.rows[0], alertCandidates).catch(() => {});
      recordLowStockAlerts(storeId, alertCandidates).catch(() => {});
    }

    res.status(201).json({
      message: `Order ${created.order_number} placed successfully.`,
      order: {
        id: created.id,
        orderNumber: created.order_number,
        totalAmount: Number(created.totalAmount),
        paymentMethod,
        paymentStatus: 'PENDING',
        orderStatus: 'PENDING',
        createdAt: created.created_at,
      },
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    next(err);
  }
});

/* --------------------------------- Helpers --------------------------------- */
function mapOrder(r) {
  return {
    id: r.id,
    orderNumber: r.order_number,
    customer: { name: r.customer_name, phone: r.customer_phone, address: r.customer_address },
    totalAmount: Number(r.total_amount),
    paymentMethod: r.payment_method,
    paymentStatus: r.payment_status || 'PENDING',
    orderStatus: r.order_status || 'PENDING',
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    items: (r.items || []).map((i) => ({
      id: i.id,
      productId: i.productId,
      variantId: i.variantId,
      productName: i.productName,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      totalPrice: Number(i.totalPrice),
    })),
  };
}
/* ------------------------------- Seller feed ------------------------------- */
// GET /api/seller/orders?status=ALL|PENDING|PROCESSING|DELIVERED|CANCELLED
router.get('/seller/orders', authenticateSeller, async (req, res, next) => {
  try {
    const status = String(req.query.status || 'ALL').toUpperCase();
    if (status !== 'ALL' && !ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid status filter: ${status}` });
    }
    const storeId = req.auth.sub;
    const where = status === 'ALL'
      ? 'o.store_id = $1'
      : 'o.store_id = $1 AND o.order_status = $2';
    const params = status === 'ALL' ? [storeId] : [storeId, status];

    const [feed, counts] = await Promise.all([
      query(
        `SELECT o.id, o.order_number, o.customer_name, o.customer_phone,
                o.customer_address, o.total_amount, o.payment_method,
                o.payment_status, o.order_status, o.notes,
                o.created_at, o.updated_at,
                COALESCE(JSON_AGG(JSON_BUILD_OBJECT(
                    'id',          i.id,
                    'productId',   i.product_id,
                    'variantId',   i.variant_id,
                    'productName', i.product_name,
                    'quantity',    i.quantity,
                    'unitPrice',   i.unit_price,
                    'totalPrice',  i.total_price
                  ) ORDER BY i.product_name)
                FILTER (WHERE i.id IS NOT NULL), '[]') AS items
           FROM orders o
           LEFT JOIN order_items i ON i.order_id = o.id
          WHERE ${where}
          GROUP BY o.id
          ORDER BY o.created_at DESC
          LIMIT 200`,
        params,
      ),
      query(
        `SELECT order_status AS status, COUNT(*)::int AS n
           FROM orders WHERE store_id = $1 GROUP BY order_status`,
        [storeId],
      ),
    ]);

    const countMap = { ALL: 0 };
    for (const r of counts.rows) {
      countMap[r.status] = r.n;
      countMap.ALL += r.n;
    }
    res.json({ orders: feed.rows.map(mapOrder), counts: countMap, currency: 'GHS' });
  } catch (err) {
    next(err);
  }
});

/* --------------------------- Fulfillment transition ------------------------ */
// PATCH /api/seller/orders/:id/status - order_status and/or payment_status.
router.patch('/seller/orders/:id/status', authenticateSeller, async (req, res, next) => {
  try {
    const b = req.body || {};
    const sets = [];
    const params = [];
    let idx = 1;

    const orderStatus = b.order_status ?? b.orderStatus;
    if (orderStatus !== undefined) {
      const v = String(orderStatus).toUpperCase();
      if (!ORDER_STATUSES.includes(v)) {
        return res.status(400).json({ error: `Invalid order_status: ${v}` });
      }
      sets.push(`order_status = $${idx++}`);
      params.push(v);
    }

    const paymentStatus = b.payment_status ?? b.paymentStatus;
    if (paymentStatus !== undefined) {
      const v = String(paymentStatus).toUpperCase();
      if (!PAYMENT_STATUSES.includes(v)) {
        return res.status(400).json({ error: `Invalid payment_status: ${v}` });
      }
      sets.push(`payment_status = $${idx++}`);
      params.push(v);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'Provide order_status and/or payment_status.' });
    }

    params.push(req.params.id, req.auth.sub);
    const upd = await query(
      `UPDATE orders
          SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $${idx++} AND store_id = $${idx}
        RETURNING id, order_number, order_status, payment_status, updated_at`,
      params,
    );
    const row = upd.rows[0];
    if (!row) {
      return res.status(404).json({ error: 'Order not found for your store.' });
    }

    res.json({
      message: 'Order updated.',
      order: {
        id: row.id,
        orderNumber: row.order_number,
        orderStatus: row.order_status,
        paymentStatus: row.payment_status,
        updatedAt: row.updated_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;