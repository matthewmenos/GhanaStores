/**
 * DiDwa - Order lifecycle (single source of truth)
 *
 * All channels (POS, WhatsApp/storefront checkout, fulfilment console) write
 * the SAME canonical columns on `orders`:
 *
 *   status      PENDING | PAID | FULFILLED | DELIVERED | CANCELLED
 *   subtotal / total / paid_at / points_earned
 *
 * The fulfilment console still speaks in two UI concepts (order progress +
 * payment received); deriveOrderStatus()/derivePaymentStatus() translate
 * canonical rows into that shape, so no second ledger exists.
 *
 * transitionOrder() performs the side effects that MUST stay atomic with the
 * status change:
 *   -> PAID               credit the merchant wallet + award loyalty points
 *   -> FULFILLED/DELIVERED stamp paid_at (no double credit)
 *   -> CANCELLED          restock reserved units
 */
import { pointsForSpend } from '../utils/helpers.js';

export const CANONICAL_STATUSES = ['PENDING', 'PAID', 'FULFILLED', 'DELIVERED', 'CANCELLED'];
export const PAID_STATUSES = ['PAID', 'FULFILLED', 'DELIVERED'];

/** Lifecycle progress shown in the fulfilment console. */
export function deriveOrderStatus(status) {
  switch (String(status || '').toUpperCase()) {
    case 'PAID':
    case 'FULFILLED':
      return 'PROCESSING';
    case 'DELIVERED':
      return 'DELIVERED';
    case 'CANCELLED':
      return 'CANCELLED';
    default:
      return 'PENDING';
  }
}

/** Payment flag shown in the fulfilment console. */
export function derivePaymentStatus(status) {
  return PAID_STATUSES.includes(String(status || '').toUpperCase()) ? 'PAID' : 'PENDING';
}

/** Console statuses -> canonical status (used by PATCH translation). */
export const CONSOLE_TO_CANONICAL = {
  PENDING: 'PENDING',
  PROCESSING: 'FULFILLED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
};

/** Allowed canonical transitions (prevents PAID -> PENDING etc). */
const ALLOWED = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['FULFILLED', 'DELIVERED', 'CANCELLED'],
  FULFILLED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

export function canTransition(from, to) {
  if (from === to) return false;
  return (ALLOWED[String(from || '').toUpperCase()] || []).includes(String(to || '').toUpperCase());
}

/**
 * Move a locked order row to `next`, applying wallet/loyalty/restock effects.
 * Caller owns the transaction and has already run
 * `SELECT * FROM orders WHERE id = $1 AND store_id = $2 FOR UPDATE`.
 *
 * @returns {Promise<{status:string, order_status:string, payment_status:string,
 *                    total:number, paid_at:Date, pointsAwarded:number}>}
 */
export async function transitionOrder(client, { order, storeId, next }) {
  const from = String(order.status || '').toUpperCase();
  const to = String(next || '').toUpperCase();

  if (!CANONICAL_STATUSES.includes(to)) {
    throw Object.assign(new Error(`Status must be one of ${CANONICAL_STATUSES.join(', ')}.`), { status: 400 });
  }
  if (from === 'CANCELLED') {
    throw Object.assign(new Error('Cancelled orders cannot change status.'), { status: 409 });
  }
  if (from === to) {
    throw Object.assign(new Error(`Order is already ${to}.`), { status: 409 });
  }
  if (!canTransition(from, to)) {
    const needsPayment = !PAID_STATUSES.includes(from) && PAID_STATUSES.includes(to);
    throw Object.assign(
      new Error(needsPayment
        ? 'Record the payment first, then move the order forward.'
        : `Cannot move an order from ${from} to ${to}.`),
      { status: 409 },
    );
  }

  // Cancellation releases the stock reserved at checkout.
  if (to === 'CANCELLED') {
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

  // First payment confirmation: credit the wallet once and award loyalty.
  let pointsAwarded = 0;
  if (to === 'PAID') {
    const cfg = await client.query(
      'SELECT loyalty_points_per_ghs FROM stores WHERE id = $1',
      [storeId],
    );
    pointsAwarded = pointsForSpend(order.total, cfg.rows[0]?.loyalty_points_per_ghs ?? 0);

    await client.query(
      'UPDATE stores SET available_balance = available_balance + $2 WHERE id = $1',
      [storeId, order.total],
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
        [storeId, order.customer_name, order.customer_phone, pointsAwarded, order.total],
      );
    }
  }

  // Mirror the canonical status into the legacy console columns so every
  // reader (old and new) sees one consistent ledger.
  const upd = await client.query(
    `UPDATE orders
        SET status = $3,
            payment_status = CASE WHEN $3 IN ('PAID','FULFILLED','DELIVERED') THEN 'PAID' ELSE 'PENDING' END,
            order_status = CASE
              WHEN $3 = 'DELIVERED' THEN 'DELIVERED'
              WHEN $3 = 'CANCELLED' THEN 'CANCELLED'
              WHEN $3 IN ('PAID','FULFILLED') THEN 'PROCESSING'
              ELSE 'PENDING' END,
            paid_at = CASE WHEN $3 IN ('PAID','FULFILLED','DELIVERED') AND paid_at IS NULL
                           THEN NOW() ELSE paid_at END,
            points_earned = points_earned + $4,
            updated_at = NOW()
      WHERE id = $1 AND store_id = $2
      RETURNING status, order_status, payment_status, total, paid_at`,
    [order.id, storeId, to, pointsAwarded],
  );

  return { ...upd.rows[0], pointsAwarded };
}

export default {
  CANONICAL_STATUSES,
  PAID_STATUSES,
  CONSOLE_TO_CANONICAL,
  deriveOrderStatus,
  derivePaymentStatus,
  canTransition,
  transitionOrder,
};
