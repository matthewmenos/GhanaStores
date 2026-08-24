/**
 * Seed demo data: a store, products with variants, and a customer so the
 * dashboard, POS, payouts and analytics have data immediately.
 * Usage: npm run db:seed
 */
import bcrypt from 'bcryptjs';
import { pool, query, withTransaction } from '../config/database.js';
import { normalizeGhPhone, slugifyStoreName, generateOrderNumber, money } from '../utils/helpers.js';

const DEMO = {
  name: "Ama's Fashion Hub",
  email: 'demo@ghastores.com',
  phone: '0244000000',
  password: 'ghanastores1',
  whatsappNumber: '0244000000',
  momoNumber: '0244000000',
};

async function main() {
  const hash = await bcrypt.hash(DEMO.password, 12);
  const slug = slugifyStoreName(DEMO.name);
  const normPhone = normalizeGhPhone(DEMO.phone);

  // Idempotent: reuse the existing demo store when present.
  const existing = await query('SELECT id FROM stores WHERE LOWER(email) = $1', [DEMO.email]);
  let storeId;
  if (existing.rows[0]) {
    storeId = existing.rows[0].id;
    console.log(`Demo store already exists (${DEMO.email}). Refreshing catalog...`);
  } else {
    const created = await withTransaction(async (t) =>
      t.query(
        `INSERT INTO stores (name, owner_name, email, phone, password_hash,
                             subdomain_slug, whatsapp_number, momo_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [DEMO.name, 'Ama Mensah', DEMO.email, normPhone, hash, slug,
          normalizeGhPhone(DEMO.whatsappNumber), normalizeGhPhone(DEMO.momoNumber)],
      ));
    storeId = created.rows[0].id;
    console.log(`Created demo store "${DEMO.name}" with a 14-day trial.`);
  }

  const catalog = [
    ['Kente Wrap Dress', 'Handwoven ceremonial dress', 'Apparel', 450,
      [['Size', 'M', null, 14], ['Size', 'L', 465, 9]]],
        ['Shea Butter Balm 250g', 'Raw, vitamin-rich shea blend', 'Beauty', 60,
      [['Jar', 'Original', null, 40], ['Jar', 'Cocoa', 65, 3]]],
    ['Adinkra Tote Bag', 'Hand-stamped leather tote', 'Accessories', 180,
      [['Colour', 'Brown', null, 7], ['Colour', 'Black', null, 2]]],
    ['Bolgatanga Basket', 'Large market basket', 'Home', 120,
      [['Size', 'Large', null, 5], ['Size', 'Medium', 95, 12]]],
  ];

  for (const [name, desc, category, price, variants] of catalog) {
    const prod = await query(
      `SELECT id FROM products WHERE store_id = $1 AND name = $2`,
      [storeId, name],
    );
    if (prod.rows[0]) continue;
    const ins = await query(
      `INSERT INTO products (store_id, name, description, category, price)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [storeId, name, desc, category, price],
    );
    for (const [optName, optVal, override, stock] of variants) {
      await query(
        `INSERT INTO product_variants
           (store_id, product_id, option_name, option_value, price_override,
            stock_quantity, low_stock_threshold)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [storeId, ins.rows[0].id, optName, optVal, override, stock,
          optVal === 'Black' ? 3 : 5],
      );
    }
  }
  console.log('Catalog seeded.');

  /* ---- A couple of paid orders so analytics charts are not empty ---- */
  const hasOrders = await query('SELECT 1 FROM orders WHERE store_id = $1 LIMIT 1', [storeId]);
  if (!hasOrders.rows[0]) {
    await withTransaction(async (t) => {
      for (let monthsAgo = 3; monthsAgo >= 0; monthsAgo -= 1) {
        const total = money(280 + Math.random() * 900);
        const o = await t.query(
          `INSERT INTO orders
             (store_id, order_number, customer_name, customer_phone, channel,
              payment_method, status, subtotal, total, points_earned, paid_at, created_at)
           VALUES ($1,$2,'Kwame Owusu','233201234567','POS','CASH','PAID',$3,$3,
                   FLOOR($3), NOW(), NOW() - ($4 || ' months')::interval)
           RETURNING id`,
          [storeId, generateOrderNumber(), total, String(monthsAgo)],
        );
        await t.query(
          `INSERT INTO customers (store_id, name, phone, loyalty_points, total_spent, orders_count)
           VALUES ($1,'Kwame Owusu','233201234567',FLOOR($2),$2,1)
           ON CONFLICT (store_id, phone) DO UPDATE SET total_spent = customers.total_spent + $2`,
          [storeId, total],
        );
        void o;
      }
    });
    console.log('Sample orders seeded.');
  }

  console.log('\nDemo login -> email: demo@ghastores.com | password: ghanastores1');
}

main()
  .catch((err) => { console.error('db:seed failed:', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
