import { Router } from 'express';
import { pool } from '../config/database.js';
import { requireSellerAuth } from '../middleware/authMiddleware.js';

const router = Router();

/**
 * GET /api/analytics/summary
 * KPI tiles: total revenue, paid order count, average order value.
 */
router.get('/summary', requireSellerAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         COALESCE(SUM(total), 0)::float AS total_revenue,
         COUNT(*)::int AS paid_orders,
         COALESCE(AVG(total), 0)::float AS average_order_value
       FROM orders
       WHERE store_id = $1 AND status IN ('PAID', 'FULFILLED')`,
      [req.auth.storeId]
    );

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/analytics/monthly-trend
 * Last 6 months of revenue, bucketed by calendar month, for the
 * Recharts <AreaChart /> on SellerAnalytics.jsx.
 */
router.get('/monthly-trend', requireSellerAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         to_char(date_trunc('month', gs), 'Mon YYYY') AS month_label,
         date_trunc('month', gs) AS month_start,
         COALESCE(o.revenue, 0)::float AS revenue,
         COALESCE(o.order_count, 0)::int AS order_count
       FROM generate_series(
         date_trunc('month', now()) - INTERVAL '5 months',
         date_trunc('month', now()),
         INTERVAL '1 month'
       ) AS gs
       LEFT JOIN (
         SELECT date_trunc('month', created_at) AS month_start,
                SUM(total) AS revenue,
                COUNT(*) AS order_count
         FROM orders
         WHERE store_id = $1 AND status IN ('PAID', 'FULFILLED')
         GROUP BY 1
       ) o ON o.month_start = gs
       ORDER BY month_start ASC`,
      [req.auth.storeId]
    );

    res.json(rows.map(({ month_label, revenue, order_count }) => ({
      month: month_label,
      revenue,
      orders: order_count,
    })));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/analytics/top-products
 * Best sellers by units moved, for a supplementary bar chart.
 */
router.get('/top-products', requireSellerAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.name, SUM(oi.quantity)::int AS units_sold,
              SUM(oi.quantity * oi.unit_price)::float AS revenue
       FROM order_items oi
       JOIN product_variants pv ON pv.id = oi.variant_id
       JOIN products p ON p.id = pv.product_id
       JOIN orders o ON o.id = oi.order_id
       WHERE o.store_id = $1 AND o.status IN ('PAID', 'FULFILLED')
       GROUP BY p.name
       ORDER BY units_sold DESC
       LIMIT 5`,
      [req.auth.storeId]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
