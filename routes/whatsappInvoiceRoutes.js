import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/database.js';
import { requireSellerAuth } from '../middleware/authMiddleware.js';
import { generateReceiptPdf } from '../services/pdfService.js';

const router = Router();

const cartSchema = z.object({
  storeSlug: z.string().min(1),
  items: z.array(z.object({
    name: z.string(),
    variantLabel: z.string().optional(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().positive(),
  })).min(1),
  customerName: z.string().optional(),
});

/**
 * POST /api/whatsapp/cart-link
 * Public (buyer-facing) endpoint: converts a storefront cart into a
 * pre-formatted WhatsApp deep link pointed at the merchant's phone,
 * so the buyer's tap opens WhatsApp with the order already typed out.
 */
router.post('/cart-link', async (req, res, next) => {
  try {
    const input = cartSchema.parse(req.body);

    const { rows } = await pool.query(
      `SELECT phone, store_name FROM stores WHERE subdomain_slug = $1 OR custom_domain = $1`,
      [input.storeSlug]
    );
    const store = rows[0];
    if (!store) return res.status(404).json({ error: 'Store not found.' });

    const total = input.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    const lines = input.items.map(
      (i) => `• ${i.quantity}x ${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ''} — GHS ${(i.unitPrice * i.quantity).toFixed(2)}`
    );

    const message = [
      `Hello ${store.store_name}, I'd like to order:`,
      '',
      ...lines,
      '',
      `Total: GHS ${total.toFixed(2)}`,
      input.customerName ? `Name: ${input.customerName}` : null,
    ].filter(Boolean).join('\n');

    const whatsappNumber = store.phone.replace(/\D/g, '');
    const waLink = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

    res.json({ whatsappLink: waLink, total });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    next(err);
  }
});

/**
 * GET /api/whatsapp/invoices/:orderId/pdf
 * Generates and streams a branded PDF receipt with a QR verification
 * code for a completed order (used both for buyer download and for
 * attaching to the WhatsApp order confirmation).
 */
router.get('/invoices/:orderId/pdf', requireSellerAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.id, o.created_at, o.subtotal, o.loyalty_discount, o.total, o.payment_method,
              s.store_name, c.full_name AS customer_name,
              json_agg(json_build_object(
                'name', p.name, 'unitPrice', oi.unit_price, 'quantity', oi.quantity
              )) AS items
       FROM orders o
       JOIN stores s ON s.id = o.store_id
       LEFT JOIN customers c ON c.id = o.customer_id
       JOIN order_items oi ON oi.order_id = o.id
       JOIN product_variants pv ON pv.id = oi.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE o.id = $1 AND o.store_id = $2
       GROUP BY o.id, s.store_name, c.full_name`,
      [req.params.orderId, req.auth.storeId]
    );

    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const pdfBuffer = await generateReceiptPdf({
      id: order.id,
      storeName: order.store_name,
      customerName: order.customer_name,
      paymentMethod: order.payment_method,
      subtotal: Number(order.subtotal),
      loyaltyDiscount: Number(order.loyalty_discount),
      total: Number(order.total),
      createdAt: order.created_at,
      items: order.items,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="receipt-${order.id.slice(0, 8)}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

export default router;
