/**
 * DiDwa - WhatsApp Commerce & Automated PDF Invoicing
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
import { transitionOrder } from '../services/orderLifecycle.js';
import {
  normalizeGhPhone, generateOrderNumber, formatGhs,
  pointsForSpend, toIntOr, money,
} from '../utils/helpers.js';

const router = Router();

/* The receipt share-link HMAC must use the same secret that signed session
 * tokens. authMiddleware refuses to boot in production without JWT_SECRET,
 * so this module must not fall back to a hard-coded dev secret either. */
const JWT_SECRET = (() => {
  const fromEnv = (process.env.JWT_SECRET || '').trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required when NODE_ENV=production (receipt share-links).');
  }
  console.warn('[orders] JWT_SECRET is not set - receipt share-links use the development secret. Never deploy like this.');
  return 'didwa-dev-secret';
})();
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
    `Placed via ${process.env.PLATFORM_DOMAIN || 'didwaghana.com'}`,
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

/* Mark PAID (wallet credit + loyalty award) / FULFILLED / CANCELLED (restock).
 * Delegates to the shared lifecycle in services/orderLifecycle.js - the SAME
 * canonical transition the fulfilment console uses, so both UIs move one
 * ledger. PENDING -> FULFILLED/DELIVERED without a recorded payment is
 * rejected inside transitionOrder (prevents unpaid "fulfilled" orders). */
router.patch('/:id/status', requireSeller, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const nextStatus = String(req.body?.status || '').toUpperCase();
    if (!['PAID', 'FULFILLED', 'DELIVERED', 'CANCELLED'].includes(nextStatus)) {
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

    const moved = await transitionOrder(client, {
      order,
      storeId: req.auth.sub,
      next: nextStatus,
    });

    await client.query('COMMIT');
    client.release();

    res.json({
      message: `Order ${order.order_number} marked ${moved.status}.` +
        (moved.pointsAwarded > 0 ? ` ${moved.pointsAwarded} loyalty points awarded.` : ''),
      status: moved.status,
      pointsAwarded: moved.pointsAwarded,
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    client.release();
    if (err.status) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
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

async function streamOrderPdf(req, res) {
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
      `attachment; filename="DiDwa-${order.order_number}.pdf"`,
    );
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (err) {
    throw err;
  }
}

// GET /api/orders/:id/receipt and GET /api/orders/:id/invoice both stream the
// same QR-verified PDF invoice (store/customer/itemized-GHS/payment status).
router.get('/:id/receipt', (req, res, next) => {
  streamOrderPdf(req, res).catch(next);
});
router.get('/:id/invoice', (req, res, next) => {
  streamOrderPdf(req, res).catch(next);
});

/* ------------------- /api/whatsapp/generate-link --------------------------- */
// Public helper: converts a buyer cart into a pre-formatted, URL-encoded
// WhatsApp click-to-chat payload aimed at the merchant. No stock is reserved
// here - checkout does that - the link simply opens WhatsApp with the order
// teed up so the buyer can confirm conversationally.
export const whatsappRouter = Router();

whatsappRouter.post('/generate-link', async (req, res, next) => {
  try {
    const b = req.body || {};
    let store = req.tenantStore || req.storeFromHost || null;
    if (!store && b.slug) {
      const s = await query(
        `SELECT id, name, whatsapp_number, phone, momo_number, currency
           FROM stores WHERE subdomain_slug = $1 LIMIT 1`,
        [String(b.slug).toLowerCase()],
      );
      store = s.rows[0];
    }
    if (!store) return res.status(404).json({ error: 'Store not found.' });

    const customer = b.customer || {};
    const customerPhone = normalizeGhPhone(customer.phone);
    if (!customerPhone) {
      return res.status(400).json({ error: 'A valid Ghana phone number is required.' });
    }

    const items = Array.isArray(b.items) ? b.items : [];
    if (items.length === 0) return res.status(400).json({ error: 'Cart is empty.' });

    const itemLines = [];
    let subtotal = 0;
    items.forEach((it, i) => {
      const qty = toIntOr(it.quantity, 0);
      if (qty <= 0) return;
      const unit = money(it.unitPrice ?? it.unit_price ?? 0);
      const lineTotal = money(unit * qty);
      subtotal = money(subtotal + lineTotal);
      const label = `${String(it.name || 'Product').slice(0, 60)}${it.variant ? ` (${it.variant})` : ''}`;
      itemLines.push(`${i + 1}. ${label} x${qty} - ${formatGhs(lineTotal)}`);
    });
    if (itemLines.length === 0) return res.status(400).json({ error: 'No valid line items.' });

    const deliveryFee = money(b.deliveryFee ?? 0);
    const total = money(subtotal + deliveryFee);
    const customerName = String(customer.name || 'Buyer').trim();

    const messageLines = [
      `*NEW ORDER - ${store.name}*`,
      '',
      '*ITEMS*',
      ...itemLines,
      '',
      `Subtotal: ${formatGhs(subtotal)}`,
      ...(deliveryFee > 0 ? [`Delivery: ${formatGhs(deliveryFee)}`] : []),
      `*TOTAL: ${formatGhs(total)}*`,
      '',
      `Customer: ${customerName} (${customerPhone})`,
      ...(String(customer.address || '').trim() ? [`Address: ${String(customer.address).trim()}`] : []),
      ...(store.momo_number ? [`Pay via MoMo: ${store.momo_number}`] : ['Payment: Cash on delivery']),
      ...(String(b.notes || '').trim() ? [`Notes: ${String(b.notes).trim()}`] : []),
      `Placed via ${process.env.PLATFORM_DOMAIN || 'didwaghana.com'}`,
    ];

    const sellerPhone = normalizeGhPhone(store.whatsapp_number || store.phone) ||
      String(store.whatsapp_number || store.phone).replace(/\D/g, '');
    const waLink = `https://wa.me/${sellerPhone}?text=${encodeURIComponent(messageLines.join('\n'))}`;

    return res.json({
      waLink,
      sellerPhone,
      itemCount: itemLines.length,
      totals: { subtotal, deliveryFee, total, currency: 'GHS' },
      preview: messageLines.map((l) => l.replace(/\*/g, '')).join('\n'),
    });
  } catch (err) {
    next(err);
  }
});

export default router;



