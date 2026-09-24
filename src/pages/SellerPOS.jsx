/**
 * In-store POS terminal (Module 4) + Rider Transit Balance panel.
 * Quick product grid, cart with loyalty redemption, CASH / MoMo checkout,
 * and one-click rider cash reconciliation into the merchant wallet.
 */
import { useEffect, useMemo, useState } from 'react';
import { api, ghs, queueOfflineSale, flushOfflineSales } from '../api.js';
import { redeemValue } from '../loyalty.js';
import StatusBadge from '../components/UI/StatusBadge.jsx';
import {
  IconCart, IconCash, IconPhonePay, IconSpinner, IconAlert, IconCheck,
  IconTruck, IconSearch, IconPlus, IconMinus, IconTrash, IconCoins,
} from '../components/icons.jsx';

const NETWORKS = ['MTN', 'VODAFONE', 'AT'];

export default function SellerPOS() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]); // [{variantId, name, label, price, qty}]
  const [search, setSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [momoNetwork, setMomoNetwork] = useState('MTN');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [loyaltyInfo, setLoyaltyInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null); // {ok, msg}

  const [riders, setRiders] = useState(null);
  const [riderName, setRiderName] = useState('');
  const [riderPhone, setRiderPhone] = useState('');
  const [codOrders, setCodOrders] = useState([]);

  useEffect(() => {
    const retryPending = () => flushOfflineSales().catch(() => {});
    retryPending();
    window.addEventListener('online', retryPending);
    return () => window.removeEventListener('online', retryPending);
  }, []);

  useEffect(() => {
    api.get('/api/inventory/products').then((d) => setProducts(d.products || []))
      .catch((e) => setFeedback({ ok: false, msg: e.message }));
    api.get('/api/pos/riders').then(setRiders).catch(() => {});
    api.get('/api/orders?status=PAID').then((d) => setCodOrders(
      (d.orders || []).filter((o) => o.payment_method === 'COD'),
    )).catch(() => {});
  }, []);

  const flatVariants = useMemo(
    () => products.flatMap((p) => (p.variants || []).map((v) => ({
      variantId: v.id,
      name: p.name,
      label: v.optionValue,
      price: Number(v.priceOverride ?? p.price ?? 0),
      stock: Number(v.stockQuantity),
    }))),
    [products],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return flatVariants;
    return flatVariants.filter((v) =>
      `${v.name} ${v.label}`.toLowerCase().includes(q));
  }, [flatVariants, search]);

  const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const pointValue = loyaltyInfo?.pointValueGhs ?? 0.05;
  const maxRedeemable = loyaltyInfo?.customer?.loyalty_points ?? 0;
  const discount = Math.min(redeemValue(redeemPoints, pointValue), subtotal);
  const total = Math.max(0, subtotal - discount);

  function addToCart(v) {
    setCart((prev) => {
      const found = prev.find((c) => c.variantId === v.variantId);
      if (found) {
        if (found.qty + 1 > v.stock) return prev;
        return prev.map((c) => (c.variantId === v.variantId ? { ...c, qty: c.qty + 1 } : c));
      }
      return [...prev, { ...v, qty: 1 }];
    });
  }
  function changeQty(variantId, delta) {
    setCart((prev) => prev
      .map((c) => (c.variantId === variantId ? { ...c, qty: Math.max(0, c.qty + delta) } : c))
      .filter((c) => c.qty > 0));
  }

  async function lookupLoyalty(phone) {
    setCustomerPhone(phone);
    setRedeemPoints(0);
    setLoyaltyInfo(null);
    if (!phone || phone.length < 9) return;
    try {
      const d = await api.get(`/api/pos/loyalty/${encodeURIComponent(phone)}`);
      setLoyaltyInfo(d);
    } catch { /* silent - loyalty is optional at POS */ }
  }

  async function checkout() {
    if (cart.length === 0 || busy) return;
    setBusy(true);
    setFeedback(null);
    const idempotencyKey = `pos-${crypto.randomUUID()}`;
    const payload = {
      idempotencyKey,
      items: cart.map((c) => ({ variantId: c.variantId, quantity: c.qty })),
      paymentMethod,
      momoNetwork,
      customerPhone: customerPhone || undefined,
      customerName: customerName || undefined,
      redeemPoints: redeemPoints || undefined,
    };
    try {
      const d = await api.post('/api/pos/sales', payload);
      setFeedback({ ok: true, msg: `${d.order.order_number} recorded - ${ghs(d.order.total)} added to wallet.` });
      setCart([]);
      setCustomerPhone(''); setCustomerName('');
      setRedeemPoints(0); setLoyaltyInfo(null);
      const fresh = await api.get('/api/inventory/products');
      setProducts(fresh.products || []);
    } catch (e) {
      if (!navigator.onLine && paymentMethod === 'CASH') {
        queueOfflineSale({ idempotencyKey, payload, queuedAt: new Date().toISOString() });
        setFeedback({ ok: true, msg: 'You are offline. This cash sale was queued and will sync when you reconnect.' });
        setCart([]);
        setCustomerPhone(''); setCustomerName(''); setRedeemPoints(0); setLoyaltyInfo(null);
      } else {
        setFeedback({ ok: false, msg: e.message });
      }
    } finally {
      setBusy(false);
    }
  }

  async function dispatchRider() {
    if (!riderName || codOrders.length === 0) return;
    setBusy(true);
    try {
      await api.post('/api/pos/riders/dispatch', {
        riderName,
        riderPhone,
        orderIds: codOrders.map((o) => o.id),
      });
      setRiderName(''); setRiderPhone('');
      setCodOrders([]);
      setRiders(await api.get('/api/pos/riders'));
      setFeedback({ ok: true, msg: 'Cash handed to rider. Track it under Rider Transit.' });
    } catch (e) {
      setFeedback({ ok: false, msg: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function reconcile(id) {
    setBusy(true);
    try {
      const d = await api.post(`/api/pos/riders/${id}/reconcile`, {});
      setFeedback({ ok: true, msg: d.message });
      setRiders(await api.get('/api/pos/riders'));
    } catch (e) {
      setFeedback({ ok: false, msg: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${feedback.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {feedback.ok ? <IconCheck size={16} /> : <IconAlert size={16} />} {feedback.msg}
        </div>
      )}

      {/* Rider Transit Balance panel */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
            <IconTruck size={17} className="text-orange-600" /> Rider Transit Balance
          </h3>
          {riders && (
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${Number(riders.transitTotal) > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>
              {ghs(riders.transitTotal || 0)} in transit
            </span>
          )}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            {riders?.openTransits?.length > 0 ? (
              <ul className="space-y-2">
                {riders.openTransits.map((t) => (
                  <li key={t.id} className="flex items-center justify-between rounded-xl bg-mist px-4 py-3">
                    <div>
                      <p className="text-sm font-bold text-charcoal">{t.rider_name}</p>
                      <p className="text-xs text-slate-500">{t.orderCount} orders - dispatched {new Date(t.dispatched_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-extrabold text-charcoal">{ghs(t.amount)}</span>
                      <button type="button" onClick={() => reconcile(t.id)} disabled={busy}
                        className="rounded-lg bg-emerald-brand px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                        Reconcile
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">No cash currently with riders.</p>
            )}

            {codOrders.length > 0 && (
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold uppercase text-slate-400">Dispatch COD orders ({codOrders.length})</p>
                <input value={riderName} onChange={(e) => setRiderName(e.target.value)}
                  placeholder="Rider name" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                <input value={riderPhone} onChange={(e) => setRiderPhone(e.target.value)}
                  placeholder="Rider phone (optional)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                <button type="button" onClick={dispatchRider} disabled={busy}
                  className="w-full rounded-lg bg-blue-600 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">
                  Hand cash to rider
                </button>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-100 p-4">
            <p className="text-xs font-semibold uppercase text-slate-400">Reconciled history</p>
            {(riders?.reconciledHistory?.length ?? 0) === 0 ? (
              <p className="mt-2 text-sm text-slate-400">Nothing reconciled yet.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {riders.reconciledHistory.slice(0, 6).map((t) => (
                  <li key={t.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{t.rider_name}</span>
                    <span className="font-semibold text-emerald-brand">{ghs(t.amount)} received</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Register: product grid + cart */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Product grid */}
        <div className="lg:col-span-3">
          <div className="relative mb-4">
            <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products or variants..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm outline-none focus:border-blue-600" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {visible.map((v) => (
              <button key={v.variantId} type="button" onClick={() => addToCart(v)}
                disabled={v.stock === 0}
                className={`rounded-2xl border p-4 text-left transition ${v.stock === 0
                  ? 'cursor-not-allowed border-red-100 bg-red-50/50 opacity-60'
                  : 'border-slate-200 bg-white hover:border-blue-600 hover:shadow-md'}`}>
                <p className="truncate text-sm font-bold text-charcoal">{v.name}</p>
                <p className="text-xs text-slate-400">{v.label}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-extrabold text-blue-600">{ghs(v.price)}</span>
                  <span className={`text-xs font-semibold ${v.stock === 0 ? 'text-red-600' : v.stock <= 5 ? 'text-amber-600' : 'text-slate-400'}`}>
                    {v.stock === 0 ? 'Sold out' : `${v.stock} left`}
                  </span>
                </div>
              </button>
            ))}
            {visible.length === 0 && (
              <p className="col-span-full py-8 text-center text-sm text-slate-400">No matching products.</p>
            )}
          </div>
        </div>

        {/* Cart */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              <IconCart size={16} /> Register Cart ({cart.length})
            </h3>

            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
              {cart.length === 0 && <p className="py-4 text-center text-sm text-slate-400">Tap products to build a sale.</p>}
              {cart.map((c) => (
                <div key={c.variantId} className="flex items-center justify-between rounded-xl bg-mist px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-charcoal">{c.name}</p>
                    <p className="text-xs text-slate-400">{c.label} - {ghs(c.price)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => changeQty(c.variantId, -1)}
                      className="rounded-md bg-white p-1 text-slate-500 shadow-sm hover:text-red-600"><IconMinus size={14} /></button>
                    <span className="w-6 text-center text-sm font-bold">{c.qty}</span>
                    <button type="button" onClick={() => changeQty(c.variantId, 1)}
                      className="rounded-md bg-white p-1 text-slate-500 shadow-sm hover:text-blue-600"><IconPlus size={14} /></button>
                    <button type="button" onClick={() => changeQty(c.variantId, -c.qty)}
                      className="ml-1 rounded-md bg-white p-1 text-slate-300 shadow-sm hover:text-red-600"><IconTrash size={14} /></button>
                  </div>
                </div>
              ))}
            </div>

            {/* Customer + loyalty */}
            <div className="mt-4 space-y-2">
              <input value={customerPhone} onChange={(e) => lookupLoyalty(e.target.value)}
                placeholder="Customer phone (for loyalty)"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-600" />
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Customer name (optional)"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-600" />

              {loyaltyInfo?.customer && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                    <IconCoins size={14} /> {loyaltyInfo.customer.loyalty_points} points available
                    {loyaltyInfo.customer.redeemableValueGhs > 0 && (
                      <span className="font-medium">= {ghs(loyaltyInfo.customer.redeemableValueGhs)} off</span>
                    )}
                  </p>
                  {maxRedeemable > 0 && subtotal > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <input type="range" min="0" max={Math.min(maxRedeemable, Math.ceil(subtotal / pointValue))}
                        value={redeemPoints} onChange={(e) => setRedeemPoints(Number(e.target.value))}
                        className="flex-1 accent-amber-500" />
                      <span className="text-xs font-bold text-charcoal">{redeemPoints} pts</span>
                      {redeemPoints > 0 && (
                        <button type="button" onClick={() => setRedeemPoints(0)} className="text-slate-400 hover:text-red-600"><IconTrash size={13} /></button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Payment method */}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setPaymentMethod('CASH')}
                  className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-bold transition ${paymentMethod === 'CASH' ? 'border-emerald-brand bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500'}`}>
                  <IconCash size={16} /> Cash
                </button>
                <button type="button" onClick={() => setPaymentMethod('MOMO')}
                  className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-bold transition ${paymentMethod === 'MOMO' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500'}`}>
                  <IconPhonePay size={16} /> MoMo
                </button>
              </div>
              {paymentMethod === 'MOMO' && (
                <select value={momoNetwork} onChange={(e) => setMomoNetwork(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  {NETWORKS.map((n) => <option key={n} value={n}>{n === 'VODAFONE' ? 'Telecel / Vodafone' : n === 'AT' ? 'AT Money' : 'MTN MoMo'}</option>)}
                </select>
              )}
            </div>

            {/* Totals + charge */}
            <div className="mt-4 border-t border-dashed border-slate-200 pt-4">
              <div className="flex justify-between text-sm text-slate-500"><span>Subtotal</span><span>{ghs(subtotal)}</span></div>
              {discount > 0 && (
                <div className="mt-1 flex justify-between text-sm font-semibold text-emerald-brand">
                  <span>Loyalty discount</span><span>- {ghs(discount)}</span>
                </div>
              )}
              <div className="mt-2 flex items-center justify-between">
                <span className="text-sm font-bold uppercase text-slate-500">Total</span>
                <span className="text-2xl font-extrabold text-charcoal">{ghs(total)}</span>
              </div>
              <button type="button" onClick={checkout} disabled={cart.length === 0 || busy}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-brand py-3 text-sm font-extrabold text-white transition hover:bg-emerald-700 disabled:opacity-40">
                {busy ? <IconSpinner size={16} /> : <IconCheck size={16} />}
                {busy ? 'Processing...' : `Charge ${ghs(total)}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}






