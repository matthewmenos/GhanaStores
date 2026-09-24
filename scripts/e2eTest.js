/**
 * End-to-end API verification for DiDwa.
 * Exercises every module against a running server (default :4000).
 * Usage: node scripts/e2eTest.js [baseUrl]
 */
import { query, pool } from '../config/database.js';

const BASE = process.argv[2] || 'http://localhost:4000';


let pass = 0;
let fail = 0;

function log(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` - ${detail}` : ''}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`); }
}

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    signal: AbortSignal.timeout(8000),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* binary/empty */ }
  return { status: res.status, json, headers: res.headers };
}

async function main() {
  console.log(`\nDiDwa E2E -> ${BASE}\n`);

  /* ---------- Health & public endpoints ---------- */
  const health = await call('GET', '/health');
  log('GET /health', health.status === 200 && health.json?.ok === true,
    `db=${health.json?.db || 'n/a'}`);

  const plans = await call('GET', '/api/billing/plans');
  log('GET /api/billing/plans', plans.status === 200 && Array.isArray(plans.json?.plans),
    `${plans.json?.plans?.length || 0} plans`);

  /* ---------- Registration (Module 1) ---------- */
  const stamp = Date.now();
  const email = `e2e${stamp}@test.com`;
  const reg = await call('POST', '/api/billing/register', {
    body: {
      name: `E2E Test Store ${stamp}`,
      ownerName: 'Test Owner',
      email,
      phone: '0244000111',
      password: 'testpass123',
    },
  });
  log('POST /api/billing/register', reg.status === 201 && !!reg.json?.token,
    reg.status === 201 ? `trial ends ${(reg.json?.store?.trial_ends_at || '').slice(0, 10)}` : JSON.stringify(reg.json));
  const token = reg.json?.token;
  if (!token) { console.log('\nAborting - no auth token.'); process.exit(1); }
  const slug = reg.json?.store?.subdomain_slug;
  log('Trial auto-started (trigger)', reg.json?.store?.status === 'TRIAL', `status=${reg.json?.store?.status}`);

  const dupe = await call('POST', '/api/billing/register', {
    body: { name: 'X', email, phone: '0244000111', password: 'testpass123' },
  });
  log('Duplicate email rejected', dupe.status === 409);

  const login = await call('POST', '/api/billing/login', {
    body: { email, password: 'testpass123' },
  });
  log('POST /api/billing/login', login.status === 200 && !!login.json?.token);

  const badLogin = await call('POST', '/api/billing/login', {
    body: { email, password: 'wrongpass' },
  });
  log('Wrong password rejected', badLogin.status === 401);

  const status = await call('GET', '/api/billing/status', { token });
  log('GET /api/billing/status', status.status === 200 && status.json?.billing?.days_left != null,
    `days_left=${status.json?.billing?.days_left}`);

  /* ---------- Inventory (Module 6) ---------- */
  const prod = await call('POST', '/api/inventory/products', {
    token,
    body: {
      name: 'Kente Stole', category: 'Apparel', price: 150,
      variants: [
        { optionName: 'Colour', optionValue: 'Gold', stockQuantity: 8, lowStockThreshold: 3, priceOverride: 155 },
        { optionName: 'Colour', optionValue: 'Green', stockQuantity: 2, lowStockThreshold: 3 },
      ],
    },
  });
  log('POST /api/inventory/products', prod.status === 201, prod.status === 201 ? 'product + 2 variants' : JSON.stringify(prod.json));

  const listRes = await call('GET', '/api/inventory/products', { token });
  const products = listRes.json?.products || [];
  log('GET /api/inventory/products', listRes.status === 200 && products.length === 1);
  const goldVariant = products[0]?.variants?.find((v) => v.optionValue === 'Gold');
  const greenVariant = products[0]?.variants?.find((v) => v.optionValue === 'Green');
  if (!goldVariant || !greenVariant) {
    console.log('\nAborting - variants missing from catalog response.');
    process.exit(1);
  }
  log('Variants persisted with thresholds',
    Number(greenVariant.lowStockThreshold) === 3
    && greenVariant.lowStockAlertSent === true,
    `alert_sent=${greenVariant.lowStockAlertSent}`);

  const lowStock = await call('GET', '/api/inventory/low-stock', { token });
  log('GET /api/inventory/low-stock', lowStock.status === 200 && lowStock.json?.lowStock?.length === 1,
    `${lowStock.json?.lowStock?.length || 0} flagged`);

  const restock = await call('PATCH', `/api/inventory/variants/${greenVariant?.id}/stock`, {
    token, body: { delta: 10 },
  });
  log('PATCH variant stock (+10)', restock.status === 200 && Number(restock.json?.variant?.stockQuantity) === 12);

  /* ---------- POS sale (Module 4 + loyalty Module 2) ---------- */
  const sale = await call('POST', '/api/pos/sales', {
    token,
    body: {
      items: [{ variantId: goldVariant.id, quantity: 2 }],
      paymentMethod: 'CASH',
      customerPhone: '0201112222',
      customerName: 'Akua Buyer',
    },
  });
  log('POST /api/pos/sales (CASH)', sale.status === 201 && Number(sale.json?.order?.total) === 310,
    sale.status === 201 ? `total=${sale.json.order.total} pts=${sale.json.order.pointsEarned}` : JSON.stringify(sale.json));

  const loyalty = await call('GET', '/api/pos/loyalty/0201112222', { token });
  log('GET /api/pos/loyalty/:phone', loyalty.status === 200 && loyalty.json?.customer?.loyalty_points > 0,
    loyalty.json?.customer ? `${loyalty.json.customer.loyalty_points} pts = GHS ${loyalty.json.customer.redeemableValueGhs}` : 'no customer');

  const sale2 = await call('POST', '/api/pos/sales', {
    token,
    body: {
      items: [{ variantId: greenVariant.id, quantity: 1 }],
      paymentMethod: 'CASH',
      customerPhone: '0201112222',
      redeemPoints: loyalty.json?.customer?.loyalty_points || 0,
    },
  });
  log('POS sale with redemption', sale2.status === 201 && Number(sale2.json?.order?.discount) > 0,
    sale2.status === 201 ? `discount=${sale2.json.order.discount} redeemed=${sale2.json.order.pointsRedeemed}` : JSON.stringify(sale2.json));

  const oversell = await call('POST', '/api/pos/sales', {
    token,
    body: { items: [{ variantId: goldVariant.id, quantity: 9999 }], paymentMethod: 'CASH' },
  });
  log('Oversell blocked (409)', oversell.status === 409);

  /* ---------- Wallet top-up (deterministic payout branch) ---------- */
  // Credit the wallet to a known GHS 6,000 so the above-threshold review
  // branch is exercised regardless of earlier POS sale totals.
  const storeId = reg.json?.store?.id;
  await query(
    'UPDATE stores SET available_balance = 6000, pending_balance = 0 WHERE id = $1',
    [storeId],
  );
  console.log('  ....  Wallet topped up to GHS 6,000.00 for payout tests');

  /* ---------- Payouts (Module 3) ---------- */
  const summary = await call('GET', '/api/payouts/summary', { token });
  log('GET /api/payouts/summary', summary.status === 200 && Boolean(summary.json?.wallet),
    `available=${summary.json?.wallet?.available_balance}`);

  const paySmall = await call('POST', '/api/payouts/request', {
    token, body: { amount: 100, network: 'MTN', destination: '0244000111' },
  });
  log('Instant payout < threshold', paySmall.status === 200 && paySmall.json?.payout?.status === 'APPROVED',
    String(paySmall.json?.message || '').slice(0, 70));

  const afterPay = await call('GET', '/api/payouts/summary', { token });
  log('Balance debited after payout',
    Number(afterPay.json?.wallet?.available_balance) === Number(summary.json.wallet.available_balance) - 100,
    `now=${afterPay.json?.wallet?.available_balance}`);

  const payBig = await call('POST', '/api/payouts/request', {
    token,
    body: {
      amount: Math.min(
        Number(summary.json?.riskThresholdGhs || 5000) + 100,
        Math.floor(Number(summary.json?.wallet?.available_balance)) - 105,
      ),
      network: 'VODAFONE',
      destination: '0244000111',
    },
  });
  log('Large payout queued for review (202)', payBig.status === 202,
    String(payBig.json?.message || '').slice(0, 60));

  const overBal = await call('POST', '/api/payouts/request', {
    token, body: { amount: 999999, network: 'MTN', destination: '0244000111' },
  });
  log('Over-balance payout rejected', overBal.status === 400);

  const history = await call('GET', '/api/payouts/history', { token });
  log('GET /api/payouts/history', history.status === 200 && history.json?.payouts?.length === 2);

  /* ---------- Storefront + WhatsApp checkout (Module 5) ---------- */
  const catalog = await call('GET', `/api/domains/storefront/${slug}/products`);
  log('Public storefront catalog', catalog.status === 200 && catalog.json?.products?.length === 1,
    slug);

  const checkout = await call('POST', '/api/orders/storefront/checkout', {
    body: {
      slug,
      items: [{ variantId: goldVariant.id, quantity: 1 }],
      paymentMethod: 'COD',
      deliveryFee: 15,
      notes: 'Deliver after 5pm',
      customer: { name: 'Yaw Online', phone: '0277333444' },
    },
  });
  log('WhatsApp checkout creates order',
    checkout.status === 201 && String(checkout.json?.order?.waLink || '').startsWith('https://wa.me/233'),
    checkout.status === 201 ? `order=${checkout.json.order.order_number}` : JSON.stringify(checkout.json));
  const onlineOrder = checkout.json?.order;

  const orders = await call('GET', '/api/orders?status=PENDING', { token });
  log('Seller orders feed (PENDING)', orders.status === 200 && orders.json?.orders?.length === 1);

  const markPaid = await call('PATCH', `/api/orders/${onlineOrder?.id}/status`, {
    token, body: { status: 'PAID' },
  });
  log('Mark order PAID (wallet+loyalty)', markPaid.status === 200, markPaid.json?.message || '');

  /* Cancellation restocks inventory */
  const cancelCheckout = await call('POST', '/api/orders/storefront/checkout', {
    body: {
      slug, items: [{ variantId: goldVariant.id, quantity: 1 }],
      paymentMethod: 'COD', customer: { name: 'Cancel Test', phone: '0277333555' },
    },
  });
  const beforeCancel = await call('GET', '/api/inventory/products', { token });
  const stockBefore = beforeCancel.json.products[0].variants.find((v) => v.optionValue === 'Gold').stockQuantity;
  await call('PATCH', `/api/orders/${cancelCheckout.json?.order?.id}/status`, { token, body: { status: 'CANCELLED' } });
  const afterCancel = await call('GET', '/api/inventory/products', { token });
  const stockAfter = afterCancel.json.products[0].variants.find((v) => v.optionValue === 'Gold').stockQuantity;
  log('Cancellation restocks inventory', Number(stockAfter) === Number(stockBefore) + 1,
    `${stockBefore} -> ${stockAfter}`);

  /* ---------- PDF receipt (Module 5) ---------- */
  const pdfRes = await fetch(`${BASE}/api/orders/${onlineOrder?.id}/receipt`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const pdfBuf = pdfRes.ok ? Buffer.from(await pdfRes.arrayBuffer()) : Buffer.alloc(0);
  log('PDF receipt generated', pdfRes.status === 200
    && pdfRes.headers.get('content-type') === 'application/pdf'
    && pdfBuf.length > 1000
    && pdfBuf.slice(0, 4).toString() === '%PDF',
    `${pdfBuf.length} bytes`);

  /* ---------- Analytics (Module 2) ---------- */
  const dash = await call('GET', '/api/analytics/dashboard', { token });
  log('Analytics dashboard KPIs', dash.status === 200
    && dash.json?.monthlyTrend?.length === 6
    && Number(dash.json?.kpis?.totalRevenue) > 0,
    `revenue=${dash.json?.kpis?.totalRevenue} orders=${dash.json?.kpis?.paidOrders}`);

  const top = await call('GET', '/api/analytics/top-products', { token });
  log('Top products endpoint', top.status === 200 && Array.isArray(top.json?.products));

  /* ---------- Domains (Module 7) ---------- */
  const domMy = await call('GET', '/api/domains/my', { token });
  log('GET /api/domains/my', domMy.status === 200 && domMy.json?.dns?.recordType === 'CNAME',
    domMy.json?.subdomain);

  // Unique per run - custom domains are globally unique across the platform.
  const testDomain = `shop-e2e-${Date.now()}.example-test.com`;
  const domSet = await call('PUT', '/api/domains/my', {
    token, body: { customDomain: testDomain },
  });
  log('Attach custom domain', domSet.status === 200 && domSet.json?.customDomain === testDomain);

  const caddyOk = await fetch(`${BASE}/api/domains/caddy-ask?domain=${encodeURIComponent(testDomain)}`);
  log('Caddy ask approves known domain', caddyOk.status === 204);
  const caddyNo = await fetch(`${BASE}/api/domains/caddy-ask?domain=stranger-domain.com`);
  log('Caddy ask refuses unknown domain', caddyNo.status === 403);

  /* ---------- Auth guards & tenant isolation ---------- */
  const noAuth = await call('GET', '/api/analytics/dashboard');
  log('Unauthenticated request blocked', noAuth.status === 401);

  const otherReg = await call('POST', '/api/billing/register', {
    body: { name: `Other ${stamp}`, email: `other${stamp}@test.com`, phone: '0244000222', password: 'testpass123' },
  });
  const otherStore = await call('GET', '/api/orders', { token: otherReg.json?.token });
  log('Tenant isolation (row-level store_id)',
    otherStore.status === 200 && otherStore.json?.orders?.length === 0,
    'second store sees zero orders');

  console.log(`\n===== RESULT: ${pass} passed, ${fail} failed =====\n`);
  await pool.end().catch(() => {});
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('E2E crashed:', e); process.exit(1); });




