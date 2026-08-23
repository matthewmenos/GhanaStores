/**
 * Ghana Stores - WhatsApp Commerce & Automated PDF Invoicing
 * MODULE 5:
 *  - Buyers submit a cart -> structured order created + pre-formatted
 *    WhatsApp deep-link payload directed at the merchant's number.
 *  - Stock is reserved atomically at order time; cancellation restocks.
 *  - Seller marks orders PAID -> wallet credited + loyalty awarded.
 *  - Downloadable PDF receipts (QR verification) generated on demand.
 */
import { Router } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { pool, query, withTransaction } from '../config/database.js';
import { requireSeller } from '../middleware/authMiddleware.js';
import { buildOrderReceiptPdf } from '../services/pdfService.js';
import {
  normalizeGhPhone, generateOrderNumber, formatGhs,
  pointsForSpend, toIntOr, money,
} from '../utils/helpers.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'ghana-stores-dev-secret';
const PAID_SET = "'PAID','FULFILLED','DELIVERED'";

/* Stable receipt share-links: HMAC(orderId) lets buyers re-download a PDF
   from the QR code without exposing seller auth or guessable tokens. */
function receiptToken(orderId) {
  return crypto.createHmac('sha256', JWT_SECRET).update(`receipt:${orderId}`).digest('hex').slice(0, 32);
}

/* --------------------- Build structured WhatsApp payload -------------------- */
export function buildWhatsAppLink(store, order, items) {
  const lines = [
    `*NEW ORDER - ${store.name}*`,
    `Order No: ${order.order_number}`,
    '',
    '*ITEMS*',
    ...items.map((it) => {
      const label = it.variant_label ? `${it.product_name} (${it.variant_label})` : it.product_name;
      return `- ${label} x${it.quantity} - ${formatGhs(it.line_total)}`;
    }),
    '',
    `Subtotal: ${formatGhs(order.subtotal)}`,
    ...(Number(order.delivery_fee) > 0 ? [`Delivery: ${formatGhs(order.delivery_fee)}`] : []),
    ...(Number(order.discount_amount) > 0 ? [`Loyalty discount: -${formatGhs(order.discount_amount)}`] : []),
    `*TOTAL: ${formatGhs(order.total)}*`,
    '',
    `Customer: ${order.customer_name || 'Buyer'} (${order.customer_phone || 'n/a'})`,
    store.momo_number ? `Payment: MoMo to ${store.momo_number}` : 'Payment: Cash on delivery',
    order.notes ? `Notes: ${order.notes}` : null,
    `Placed via ${process.env.PLATFORM_DOMAIN || 'ghastores.com'}`,
  ].filter((l) => l !== null);

  const target = store.whatsapp_number || store.phone;
  return `https://wa.me/${target}?text=${encodeURIComponent(lines.join('\n'))}`;
}

/* ------------------- Public: buyer cart -> order + WA link ------------------ */
// Store is resolved from the Host header (custom domain / subdomain) or an
// explicit `slug` in the body for local/dev usage.
router.post('/storefront/checkout', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const b = req.body || {};
    let storeRow = req.storeFromHost;
    if (!storeRow && b.slug) {
      const s = await query(
        'SELECT * FROM stores WHERE subdomain_slug = $1 LIMIT 1',
        [String(b.slug).toLowerCase()],
      );
      storeRow = s.rows[0];
    }
    if (!storeRow) {
      client.release();
      return res.status(404).json({ error: 'Store not found.' });
    }
    if (storeRow.status === 'SUSPENDED') {
      client.release();
      return res.status(403).json({ error: 'This storefront is temporarily unavailable.' });
    }

    const items = Array.isArray(b.items) ? b.items : [];
    if (items.length === 0) {
      client.release();
      return res.status(400).json({ error: 'Your cart is empty.' });
    }
    const customerPhone = normalizeGhPhone(b.customer?.phone);
    if (!customerPhone) {
      client.release();
      return res.status(400).json({ error: 'A valid Ghana phone number is required for delivery.' });
    }

    await client.query('BEGIN');

    /* ---- Reserve stock atomically ---- */
    const lineItems = [];
    let subtotal = 0;
    for (const raw of items) {
      const qty = toIntOr(raw.quantity, 0);
      if (qty <= 0) continue;
      const lock = await client.query(
        `SELECT v.id, v.option_name, v.option_value, v.price_override,
                v.stock_quantity, p.name AS product_name,
                COALESCE(v.price_override, p.price) AS unit_price
           FROM product_variants v
           JOIN products p ON p.id = v.product_id
          WHERE v.id = $1 AND v.store_id = $2 AND p.is_active = TRUE AND v.stock_quantity > 0
            FOR UPDATE OF v`,
        [raw.variantId || raw.variant_id, storeRow.id],
      );
      const v = lock.rows[0];
      if (!v) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(409).json({ error: `An item in your cart just sold out. Please refresh.` });
      }
      const qtyFinal = Math.min(qty, Number(v.stock_quantity));
      const lineTotal = money(Number(v.unit_price) * qtyFinal);
      subtotal = money(subtotal + lineTotal);
      lineItems.push({
        variantId: v.id,
        productName: v.product_name,
        variantLabel: `${v.option_name}: ${v.option_value}`,
        unitPrice: Number(v.unit_price),
        quantity: qtyFinal,
        lineTotal,
      });
      await client.query(
        `UPDATE product_variants SET stock_quantity = stock_quantity - $2, updated_at = NOW()
          WHERE id = $1`,
        [v.id, qtyFinal],
      );
    }
    if (lineItems.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ error: 'No purchasable items in cart.' });
    }

    /* ---- Create PENDING order ---- */
    const deliveryFee = money(b.deliveryFee ?? 0);
    const paymentMethod = ['MOMO', 'COD'].includes(b.paymentMethod) ? b.paymentMethod : 'MOMO';
    const total = money(subtotal + deliveryFee);
    const orderNumber = generateOrderNumber();

    const ordIns = await client.query(
      `INSERT INTO orders
         (store_id, order_number, customer_name, customer_phone, channel,
          payment_method, status, subtotal, delivery_fee, total, notes)
       VALUES ($1,$2,$3,$4,'ONLINE_WHATSAPP',$5,'PENDING',$6,$7,$8,$9)
       RETURNING id, order_number, subtotal, delivery_fee, discount_amount, total`,
      [storeRow.id, orderNumber, String(b.customer?.name || 'Buyer').slice(0, 80),
        customerPhone, paymentMethod, subtotal, deliveryFee, total,
        String(b.notes || '').slice(0, 300)],
    );
    const order = ordIns.rows[0];

    for (const li of lineItems) {
      await client.query(
        `INSERT INTO order_items
           (store_id, order_id, variant_id, product_name, variant_label, unit_price, quantity, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [storeRow.id, order.id, li.variantId, li.productName,
          li.variantLabel, li.unitPrice, li.quantity, li.lineTotal],
      );
    }

    await client.query('COMMIT');
    client.release();

    // Preview of loyalty points the buyer will earn once the seller confirms.
    const earnPreview = pointsForSpend(total, storeRow.loyalty_points_per_ghs);
    const waLink = buildWhatsAppLink(storeRow, { ...order, customer_name: b.customer?.name, customer_phone: customerPhone }, lineItems);

    res.status(201).json({
      message: 'Order reserved. Complete it on WhatsApp.',
      order: { ...order, pointsPreview: earnPreview, waLink },
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    client.release();
    next(err);
  }
});

/* ---------------------- Seller: orders feed + lifecycle ---------------------- */
// NOTE: server.js mounts this router at /api/orders, so these are relative.
router.get('/', requireSeller, async (req, res, next) => {
  try {
    const statusFilter = String(req.query.status || '').toUpperCase();
    const params = [req.auth.sub];
    let where = 'o.store_id = $1';
    if (['PENDING', 'PAID', 'FULFILLED', 'DELIVERED', 'CANCELLED'].includes(statusFilter)) {
      params.push(statusFilter);
      where += ` AND o.status = $${params.length}`;
    }
    const { rows } = await query(
      `SELECT o.*,
              (SELECT COUNT(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count
         FROM orders o
        WHERE ${where}
        ORDER BY o.created_at DESC
        LIMIT 100`,
      params,
    );
    res.json({ orders: rows });
  } catch (err) {
    next(err);
  }
});

/* Mark PAID (wallet credit + loyalty award) / FULFILLED / CANCELLED (restock). */
router.patch('/:id/status', requireSeller, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const status = String(req.body?.status || '').toUpperCase();
    if (!['PAID', 'FULFILLED', 'DELIVERED', 'CANCELLED'].includes(status)) {
      client.release();
      return res.status(400).json({ error: 'Status must be PAID, FULFILLED, DELIVERED or CANCELLED.' });
    }

    await client.query('BEGIN');
    const lock = await client.query(
      'SELECT * FROM orders WHERE id = $1 AND store_id = $2 FOR UPDATE',
      [req.params.id, req.auth.sub],
    );
    const order = lock.rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ error: 'Order not found.' });
    }
    if (order.status === 'CANCELLED') {
      await client.query('ROLLBACK');
      client.release();
      return res.status(409).json({ error: 'Cancelled orders cannot change status.' });
    }
    if (order.status === status) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(409).json({ error: `Order is already ${status}.` });
    }

    /* ---- Cancellation: restock reserved units ---- */
    if (status === 'CANCELLED') {
      const items = await client.query(
        'SELECT variant_id, quantity FROM order_items WHERE order_id = $1 AND variant_id IS NOT NULL',
        [order.id],
      );
      for (const it of items.rows) {
        await client.query(
          `UPDATE product_variants
              SET stock_quantity = stock_quantity + $2,
                  updated_at = NOW(),
                  low_stock_alert_sent = CASE
                    WHEN stock_quantity + $2 > low_stock_threshold THEN FALSE
                    ELSE low_stock_alert_sent END
            WHERE id = $1`,
          [it.variant_id, it.quantity],
        );
      }
    }

    /* ---- PAID confirmation: credit wallet + award loyalty ---- */
    let pointsAwarded = 0;
    if (status === 'PAID' && !['PAID', 'FULFILLED', 'DELIVERED'].includes(order.status)) {
      const cfg = await client.query(
        'SELECT loyalty_points_per_ghs FROM stores WHERE id = $1',
        [req.auth.sub],
      );
      pointsAwarded = pointsForSpend(order.total, cfg.rows[0].loyalty_points_per_ghs);

      await client.query(
        'UPDATE stores SET available_balance = available_balance + $2 WHERE id = $1',
        [req.auth.sub, order.total],
      );

      if (order.customer_phone) {
        await client.query(
          `INSERT INTO customers (store_id, name, phone, loyalty_points, total_spent, orders_count)
           VALUES ($1,$2,$3,$4,$5,1)
           ON CONFLICT (store_id, phone) DO UPDATE SET
             loyalty_points = customers.loyalty_points + $4,
             total_spent    = customers.total_spent + $5,
             orders_count   = customers.orders_count + 1,
             name           = COALESCE(customers.name, EXCLUDED.name)`,
          [req.auth.sub, order.customer_name, order.customer_phone, pointsAwarded, order.total],
        );
      }
    }

    const upd = await client.query(
      `UPDATE orders
          SET status = $3,
              paid_at = CASE WHEN $3 IN ('PAID','FULFILLED','DELIVERED') AND paid_at IS NULL
                             THEN NOW() ELSE paid_at END,
              points_earned = points_earned + $4
        WHERE id = $1 AND store_id = $2
        RETURNING status`,
      [order.id, req.auth.sub, status, pointsAwarded],
    );

    await client.query('COMMIT');
    client.release();

    res.json({
      message: `Order ${order.order_number} marked ${status}.` +
        (pointsAwarded > 0 ? ` ${pointsAwarded} loyalty points awarded.` : ''),
      status: upd.rows[0].status,
      pointsAwarded,
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    client.release();
    next(err);
  }
});

/* --------------------- PDF receipt download (QR verified) -------------------- */
// Seller route: GET /api/orders/:id/receipt
// Public share-link (from QR): same path + ?token=<hmac>
function trySellerAuth(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return false;
  try {
    const payload = jwt.verify(header.slice(7).trim(), JWT_SECRET);
    req.auth = payload;
    return payload.role === 'SELLER' || payload.role === 'ADMIN';
  } catch {
    return false;
  }
}

router.get('/:id/receipt', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT o.*, json_build_object(
                'id', s.id, 'name', s.name, 'phone', s.phone,
                'subdomain_slug', s.subdomain_slug, 'momo_number', s.momo_number
              ) AS store
         FROM orders o JOIN stores s ON s.id = o.store_id
        WHERE o.id = $1 LIMIT 1`,
      [req.params.id],
    );
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    // Access = valid seller/admin JWT (owner) OR the HMAC share token from the QR code.
    const shareTokenOk =
      Boolean(req.query.token) && receiptToken(order.id) === String(req.query.token);
    let authenticated = Boolean(req.auth);
    if (!authenticated) authenticated = trySellerAuth(req);

    if (!shareTokenOk && !authenticated) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!shareTokenOk &&
        (!req.auth || (req.auth.sub !== order.store_id && req.auth.role !== 'ADMIN'))) {
      return res.status(403).json({ error: 'You do not have access to this receipt.' });
    }

    const itemsRes = await query(
      `SELECT product_name, variant_label, unit_price, quantity, line_total
         FROM order_items WHERE order_id = $1 ORDER BY id ASC`,
      [order.id],
    );
    delete order.store_id;

    const pdfBuffer = await buildOrderReceiptPdf({
      ...order,
      items: itemsRes.rows,
      verify_url: `${(process.env.PLATFORM_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, '')}/api/orders/${order.id}/receipt?token=${receiptToken(order.id)}`,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="GhanaStores-${order.order_number}.pdf"`,
    );
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

export default router;



