/**
 * DiDwa - Offline POS & COD Reconciliation Routes
 * MODULE 4: In-store register sales (cash / MoMo) with atomic inventory
 * decrement + loyalty awarding, plus Rider Transit Balance tracking and
 * one-click cash reconciliation into the merchant wallet.
 */
import { Router } from 'express';
import { pool, query, withTransaction } from '../config/database.js';
import { requireActiveSeller } from '../middleware/authMiddleware.js';
import { routeCollection } from '../services/paymentRouter.js';
import { sendLowStockAlertSms } from '../services/smsService.js';
import {
  normalizeGhPhone, generateOrderNumber, pointsForSpend,
  redeemValue, toIntOr, money,
} from '../utils/helpers.js';
import { collectLowStockCandidate, persistAlertFlag, recordLowStockAlerts } from './inventoryRoutes.js';

const router = Router();

const PAID = "'PAID','FULFILLED','DELIVERED'";

/* ------------------------- Loyalty lookup (checkout) ------------------------ */
// GET /api/pos/loyalty/:phone -> points balance + max redemption value.
router.get('/loyalty/:phone', requireActiveSeller, async (req, res, next) => {
  try {
    const phone = normalizeGhPhone(req.params.phone);
    if (!phone) return res.status(400).json({ error: 'Invalid Ghana phone number.' });

    const [cust, store] = await Promise.all([
      query(
        `SELECT id, name, loyalty_points, total_spent, orders_count
           FROM customers WHERE store_id = $1 AND phone = $2`,
        [req.auth.sub, phone],
      ),
      query(
        'SELECT loyalty_point_value FROM stores WHERE id = $1',
        [req.auth.sub],
      ),
    ]);
    const customer = cust.rows[0] || null;
    const pointValue = Number(store.rows[0]?.loyalty_point_value ?? 0.05);
    res.json({
      customer: customer && {
        ...customer,
        loyalty_points: customer.loyalty_points,
        redeemableValueGhs: redeemValue(customer.loyalty_points, pointValue),
      },
      pointValueGhs: pointValue,
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------- Log a POS sale ------------------------------ */
// body: {
//   items: [{ variantId, quantity }],
//   paymentMethod: 'CASH' | 'MOMO',
//   momoNetwork?: 'MTN'|'VODAFONE'|'AT',
//   customerPhone?: '0244123456', customerName?,
//   redeemPoints?: number, notes?
// }
router.post('/sales', requireActiveSeller, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const b = req.body || {};
    const clientReference = String(b.idempotencyKey || '').trim().slice(0, 120) || null;
    if (clientReference) {
      const existing = await query(
        `SELECT id, order_number, total, subtotal, discount_amount,
                points_earned, points_redeemed, notes
           FROM orders WHERE store_id = $1 AND client_reference = $2`,
        [req.auth.sub, clientReference],
      );
      if (existing.rows[0]) {
        client.release();
        return res.status(200).json({
          message: `Sale ${existing.rows[0].order_number} was already recorded.`,
          order: {
            ...existing.rows[0],
            order_number: existing.rows[0].order_number,
            total: Number(existing.rows[0].total),
            subtotal: Number(existing.rows[0].subtotal),
            discount: Number(existing.rows[0].discount_amount),
            pointsEarned: existing.rows[0].points_earned,
            pointsRedeemed: existing.rows[0].points_redeemed,
          },
        });
      }
    }
    const items = Array.isArray(b.items) ? b.items : [];
    const paymentMethod = ['CASH', 'MOMO'].includes(b.paymentMethod) ? b.paymentMethod : 'CASH';
    if (items.length === 0) {
      client.release();
      return res.status(400).json({ error: 'Cart is empty.' });
    }

    const customerPhone = b.customerPhone ? normalizeGhPhone(b.customerPhone) : null;
    if (b.customerPhone && !customerPhone) {
      client.release();
      return res.status(400).json({ error: 'Customer phone must be a valid Ghana number.' });
    }

    await client.query('BEGIN');

    /* ---- Lock + validate variants, compute totals, decrement stock ---- */
    const lineItems = [];
    let subtotal = 0;
    const alertCandidates = [];

    for (const raw of items) {
      const qty = toIntOr(raw.quantity, 0);
      if (qty <= 0) continue;
      const lock = await client.query(
        `SELECT v.*, p.name AS product_name, p.price AS base_price
           FROM product_variants v
           JOIN products p ON p.id = v.product_id
          WHERE v.id = $1 AND v.store_id = $2
            FOR UPDATE OF v`,
        [raw.variantId, req.auth.sub],
      );
      const v = lock.rows[0];
      if (!v) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(404).json({ error: 'A cart item no longer exists in your catalog.' });
      }
      if (Number(v.stock_quantity) < qty) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(409).json({
          error: `Insufficient stock for ${v.product_name} (${v.option_value}). Available: ${v.stock_quantity}.`,
        });
      }
      const unitPrice = Number(v.price_override ?? v.base_price);
      const lineTotal = money(unitPrice * qty);
      subtotal = money(subtotal + lineTotal);
      lineItems.push({
        variantId: v.id,
        productName: v.product_name,
        variantLabel: `${v.option_name}: ${v.option_value}`,
        unitPrice,
        quantity: qty,
        lineTotal,
      });

      const upd = await client.query(
        `UPDATE product_variants
            SET stock_quantity = stock_quantity - $2, updated_at = NOW()
          WHERE id = $1
          RETURNING stock_quantity, low_stock_threshold, low_stock_alert_sent`,
        [v.id, qty],
      );
      const after = upd.rows[0];
      if (collectLowStockCandidate(after)) {
        alertCandidates.push({
          id: v.id,
          product_name: v.product_name,
          option_value: v.option_value,
          stock_quantity: after.stock_quantity,
        });
        await persistAlertFlag(
          { query: (text, params) => client.query(text, params) }, v.id, true,
        );
      }
    }

    if (lineItems.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ error: 'Cart has no valid quantities.' });
    }

    // Phase 2 continues on the SAME open transaction/client.
    const ctx = { b, clientReference, paymentMethod, customerPhone, lineItems, subtotal, alertCandidates };
    await finishPosSale(req, res, client, ctx);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    client.release();
    next(err);
  }
});

/**
 * Phase 2 of a POS sale, running on the caller's OPEN transaction.
 * Ownership of COMMIT/ROLLBACK/release transfers to this function.
 */
async function finishPosSale(req, res, client, ctx) {
  const { b, clientReference, paymentMethod, customerPhone, lineItems, subtotal, alertCandidates } = ctx;
  try {
    /* ---- Loyalty config + redemption ---- */
    const storeCfg = await client.query(
      'SELECT loyalty_points_per_ghs, loyalty_point_value, name FROM stores WHERE id = $1',
      [req.auth.sub],
    );
    const { loyalty_points_per_ghs, loyalty_point_value, name: storeName } = storeCfg.rows[0];

    let discount = 0;
    let pointsRedeemed = 0;
    let customerId = null;

    if (customerPhone && b.redeemPoints) {
      const custLock = await client.query(
        `SELECT id, loyalty_points FROM customers
          WHERE store_id = $1 AND phone = $2 FOR UPDATE`,
        [req.auth.sub, customerPhone],
      );
      const cust = custLock.rows[0];
      if (cust && cust.loyalty_points > 0) {
        pointsRedeemed = Math.max(0, Math.min(toIntOr(b.redeemPoints, 0), cust.loyalty_points));
        discount = Math.min(redeemValue(pointsRedeemed, loyalty_point_value), subtotal);
        if (pointsRedeemed > 0) {
          await client.query(
            'UPDATE customers SET loyalty_points = loyalty_points - $2 WHERE id = $1',
            [cust.id, pointsRedeemed],
          );
          customerId = cust.id;
        }
      }
    }

    const total = money(Math.max(0, subtotal - discount));
    const pointsEarned = pointsForSpend(total, loyalty_points_per_ghs);
    const orderNumber = generateOrderNumber();

    /* ---- MoMo collection (MTN-first, Hubtel fallback) before crediting wallet ---- */
    let momoRef = null;
    let momoProvider = null;
    if (paymentMethod === 'MOMO') {
      const payPhone = customerPhone || normalizeGhPhone(req.store?.phone);
      const collect = await routeCollection({
        customerMsisdn: payPhone,
        amount: total,
        network: b.momoNetwork || 'MTN',
        description: `${storeName} POS sale ${orderNumber}`,
        clientReference: orderNumber,
      });
      if (!collect.success) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(402).json({ error: collect.message || 'MoMo payment was not approved.' });
      }
      momoRef = collect.reference;
      // Record which provider collected the MoMo payment on the order note.
      momoProvider = collect.provider || 'HUBTEL';
    }

    /* ---- Persist order + items ---- */
    const orderIns = await client.query(
      `INSERT INTO orders
         (store_id, order_number, customer_id, customer_name, customer_phone,
          channel, payment_method, status, subtotal, discount_amount,
          points_earned, points_redeemed, total, notes, paid_at, client_reference)
       VALUES ($1,$2,$3,$4,$5,'POS',$6,'PAID',$7,$8,$9,$10,$11,$12, NOW(),$13)
       RETURNING id, order_number, total`,
      [req.auth.sub, orderNumber, customerId, b.customerName || 'Walk-in customer',
        customerPhone, paymentMethod, subtotal, discount,
        pointsEarned, pointsRedeemed, total, clientReference,
         momoRef ? `MoMo ref ${momoRef} via ${momoProvider || 'HUBTEL'}` : (b.notes || null)],
    );
    const order = orderIns.rows[0];

    for (const li of lineItems) {
      await client.query(
        `INSERT INTO order_items
           (store_id, order_id, variant_id, product_name, variant_label, unit_price, quantity, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [req.auth.sub, order.id, li.variantId, li.productName,
          li.variantLabel, li.unitPrice, li.quantity, li.lineTotal],
      );
    }

    /* ---- Credit wallet + upsert loyalty ledger ---- */
    await client.query(
      'UPDATE stores SET available_balance = available_balance + $2 WHERE id = $1',
      [req.auth.sub, total],
    );

    if (customerPhone) {
      await client.query(
        `INSERT INTO customers (store_id, name, phone, loyalty_points, total_spent, orders_count)
         VALUES ($1,NULLIF($2,''),$3,$4,$5,1)
         ON CONFLICT (store_id, phone) DO UPDATE SET
           loyalty_points = customers.loyalty_points + $4 - $6::int,
           total_spent    = customers.total_spent + $5,
           orders_count   = customers.orders_count + 1,
           name           = COALESCE(NULLIF($2,''), customers.name)`,
        // $6 carries redeemed points so the earn+redeem land atomically.
        [req.auth.sub, b.customerName || '', customerPhone, pointsEarned, total, pointsRedeemed],
      );
    }

    await client.query('COMMIT');
    client.release();

    /* ---- Post-commit low-stock SMS dispatch (Module 6) ---- */
    if (alertCandidates.length > 0) {
      const storeRes = await query('SELECT name, phone FROM stores WHERE id = $1', [req.auth.sub]);
      sendLowStockAlertSms(storeRes.rows[0], alertCandidates).catch(() => {});
      recordLowStockAlerts(req.auth.sub, alertCandidates).catch(() => {});
    }

    return res.status(201).json({
      message: `Sale ${order.order_number} recorded. ${paymentMethod === 'CASH' ? 'Cash' : 'MoMo'} added to wallet.`,
      order: {
        ...order, subtotal, discount, total, paymentMethod, momoRef,
        momoProvider, pointsEarned, pointsRedeemed,
      },
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    client.release();
    throw err;
  }
}

/* ------------------------- Rider transit: dispatch -------------------------- */
// Seller hands COD orders to a rider; cash is tracked as "in transit".
router.post('/riders/dispatch', requireActiveSeller, async (req, res, next) => {
  try {
    const { riderName, riderPhone, orderIds } = req.body || {};
    if (!riderName) return res.status(400).json({ error: 'Rider name is required.' });
    const ids = Array.isArray(orderIds) ? orderIds.filter(Boolean) : [];
    if (ids.length === 0) {
      return res.status(400).json({ error: 'Select at least one COD order for dispatch.' });
    }
    const phone = riderPhone ? normalizeGhPhone(riderPhone) : null;

    const result = await withTransaction(async (t) => {
      const orders = await t.query(
        `SELECT id, COALESCE(NULLIF(total, 0), total_amount, 0) AS total FROM orders
          WHERE store_id = $1
            AND id = ANY($2::uuid[])
            AND payment_method = 'COD'
            AND status IN ('PAID','FULFILLED')
          FOR UPDATE`,
        [req.auth.sub, ids],
      );
      if (orders.rows.length === 0) {
        throw Object.assign(
          new Error('No eligible COD orders found (must be PAID/FULFILLED with COD payment).'),
          { status: 404 },
        );
      }
      const amount = money(orders.rows.reduce((s, o) => s + Number(o.total), 0));
      const lockedIds = orders.rows.map((o) => o.id);

      const ins = await t.query(
        `INSERT INTO rider_transits (store_id, order_ids, rider_name, rider_phone, amount)
         VALUES ($1,$2::jsonb,$3,$4,$5) RETURNING id, amount, status, dispatched_at`,
        [req.auth.sub, JSON.stringify(lockedIds), String(riderName).trim(), phone, amount],
      );
      // Handing the parcel to the rider means it left the shop - but it is NOT
      // delivered until the rider's cash is reconciled. Keep it FULFILLED and
      // mirror order_status so the fulfilment console agrees.
      await t.query(
        `UPDATE orders
            SET status = 'FULFILLED', order_status = 'PROCESSING', updated_at = NOW()
          WHERE store_id = $1 AND id = ANY($2::uuid[])`,
        [req.auth.sub, lockedIds],
      );
      return ins.rows[0];
    });

    res.status(201).json({
      message: `GHS ${Number(result.amount).toFixed(2)} handed to ${riderName}. Track it under Rider Transit.`,
      transit: { ...result, amount: Number(result.amount), riderName },
    });
  } catch (err) {
    next(err);
  }
});

/* --------------------- Rider transit: open + history list -------------------- */
router.get('/riders', requireActiveSeller, async (req, res, next) => {
  try {
    const [open, history] = await Promise.all([
      query(
        `SELECT * FROM rider_transits
          WHERE store_id = $1 AND status = 'TRANSIT'
          ORDER BY dispatched_at DESC`,
        [req.auth.sub],
      ),
      query(
        `SELECT * FROM rider_transits
          WHERE store_id = $1 AND status = 'RECONCILED'
          ORDER BY reconciled_at DESC LIMIT 20`,
        [req.auth.sub],
      ),
    ]);
    const transitTotal = money(open.rows.reduce((s, r) => s + Number(r.amount), 0));
    res.json({
      openTransits: open.rows.map((r) => ({
        ...r, amount: Number(r.amount), orderCount: r.order_ids?.length || 0,
      })),
      reconciledHistory: history.rows.map((r) => ({
        ...r, amount: Number(r.amount), orderCount: r.order_ids?.length || 0,
      })),
      transitTotal,
    });
  } catch (err) {
    next(err);
  }
});

/* --------------- One-click reconciliation into merchant wallet --------------- */
router.post('/riders/:id/reconcile', requireActiveSeller, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Lock BOTH the transit row and the wallet row before moving money.
    const lock = await client.query(
      `SELECT rt.* FROM rider_transits rt
        WHERE rt.id = $1 AND rt.store_id = $2 AND rt.status = 'TRANSIT'
        FOR UPDATE OF rt`,
      [req.params.id, req.auth.sub],
    );
    const transit = lock.rows[0];
    if (!transit) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ error: 'Open transit record not found.' });
    }

    await client.query(
      'UPDATE stores SET available_balance = available_balance + $2 WHERE id = $1',
      [req.auth.sub, transit.amount],
    );
    // The parcel truly reached the buyer: close the transit AND mark every
    // carried order DELIVERED (mirroring order_status) in the same commit.
    const parsedIds = Array.isArray(transit.order_ids) ? transit.order_ids : [];
    if (parsedIds.length > 0) {
      await client.query(
        `UPDATE orders
            SET status = 'DELIVERED', order_status = 'DELIVERED', updated_at = NOW()
          WHERE store_id = $1 AND id = ANY($2::uuid[])`,
        [req.auth.sub, parsedIds],
      );
    }
    const done = await client.query(
      `UPDATE rider_transits SET status = 'RECONCILED', reconciled_at = NOW()
        WHERE id = $1 RETURNING amount, reconciled_at`,
      [transit.id],
    );
    await client.query('COMMIT');
    client.release();

    res.json({
      message: `Reconciled GHS ${Number(transit.amount).toFixed(2)} from ${transit.rider_name} into your available balance.`,
      transit: { ...done.rows[0], amount: Number(done.rows[0].amount) },
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    client.release();
    next(err);
  }
});

/* ------------------------------ Recent POS sales ----------------------------- */
router.get('/sales', requireActiveSeller, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, order_number, customer_name, customer_phone, payment_method,
              total, points_earned, points_redeemed, created_at,
              (SELECT COUNT(*)::int FROM order_items oi WHERE oi.order_id = orders.id) AS item_count
         FROM orders
        WHERE store_id = $1 AND channel = 'POS'
        ORDER BY created_at DESC LIMIT 25`,
      [req.auth.sub],
    );
    res.json({ sales: rows });
  } catch (err) {
    next(err);
  }
});

export default router;


