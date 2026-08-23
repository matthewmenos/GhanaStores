/**
 * Quick Terminal Register Cart (Module 4 UI).
 * Line items with SVG quantity steppers, loyalty redemption slot,
 * CASH / MoMo payment toggle and one-tap checkout.
 */
import { useMemo, useState } from 'react';
import { api, ghs } from '../api.js';
import LoyaltyCheckout from './LoyaltyCheckout.jsx';
import {
  IconPlus, IconMinus, IconTrash, IconCash, IconPhone,
  IconCart, IconSpinner, IconCheck, IconAlert,
} from './icons.jsx';

export default function POSCart({ cart, setCart, onSold }) {
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [momoNetwork, setMomoNetwork] = useState('MTN');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);

  const subtotal = useMemo(
    () => cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
    [cart],
  );
  // Client-side preview only; the server re-derives the authoritative discount.
  const discountPreview = redeemPoints * 0.05;
  const total = Math.max(0, subtotal - Math.min(discountPreview, subtotal));

  function changeQty(variantId, delta) {
    setCart((prev) => prev
      .map((l) => (l.variantId === variantId
        ? { ...l, quantity: Math.min(l.stock, l.quantity + delta) }
        : l))
      .filter((l) => l.quantity > 0));
  }

  async function checkout() {
    setError('');
    if (cart.length === 0) return;
    setBusy(true);
    try {
      const res = await api.post('/api/pos/sales', {
        items: cart.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        paymentMethod,
        momoNetwork,
        customerPhone: customerPhone || undefined,
        customerName: customerName || undefined,
        redeemPoints: redeemPoints || undefined,
      });
      setReceipt(res.order);
      setCart([]);
      setRedeemPoints(0);
      onSold?.(res.order);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <div className="rounded-full bg-emerald-brand p-3 text-white">
          <IconCheck size={30} />
        </div>
        <div>
          <p className="text-lg font-bold text-emerald-800">Sale complete</p>
          <p className="text-sm text-emerald-700">{receipt.orderNumber}</p>
          <p className="mt-1 text-2xl font-extrabold text-charcoal">{ghs(receipt.total)}</p>
          {receipt.pointsEarned > 0 && (
            <p className="mt-1 text-xs font-semibold text-amber-700">
              + {receipt.pointsEarned} points earned
            </p>
          )}
        </div>
        <button
          onClick={() => setReceipt(null)}
          className="mt-2 inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition"
        >
          <IconPlus size={16} /> New Sale
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          <IconCart size={16} /> Register Cart
        </h3>
        {cart.length > 0 && (
          <button
            onClick={() => setCart([])}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
          >
            <IconTrash size={13} /> Clear
          </button>
        )}
      </div>

      <div className="min-h-[120px] flex-1 space-y-2 overflow-y-auto">
        {cart.length === 0 && (
          <div className="flex h-full min-h-[100px] flex-col items-center justify-center gap-2 text-slate-300">
            <IconCart size={34} />
            <p className="text-xs">Tap products to add them</p>
          </div>
        )}
        {cart.map((l) => (
          <div key={l.variantId} className="flex items-center gap-2 rounded-xl bg-mist px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-charcoal">{l.name}</p>
              <p className="text-xs text-slate-500">{l.variantLabel}</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => changeQty(l.variantId, -1)}
                className="rounded-lg bg-white p-1.5 text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
                aria-label="Decrease quantity"
              >
                <IconMinus size={14} />
              </button>
              <span className="w-7 text-center text-sm font-bold">{l.quantity}</span>
              <button
                onClick={() => changeQty(l.variantId, +1)}
                disabled={l.quantity >= l.stock}
                className="rounded-lg bg-white p-1.5 text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-35"
                aria-label="Increase quantity"
              >
                <IconPlus size={14} />
              </button>
            </div>
            <span className="w-20 text-right text-sm font-bold text-charcoal">
              {ghs(l.unitPrice * l.quantity)}
            </span>
          </div>
        ))}
      </div>

      {/* Loyalty redemption (Module 2) */}
      <LoyaltyCheckout phone={customerPhone} onRedeemChange={setRedeemPoints} />

      {/* Customer identity */}
      <div className="grid grid-cols-2 gap-2">
        <input
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          placeholder="Customer phone"
          inputMode="tel"
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Name (optional)"
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {/* Payment method toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setPaymentMethod('CASH')}
          className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
            paymentMethod === 'CASH'
              ? 'border-emerald-brand bg-emerald-50 text-emerald-700'
              : 'border-slate-200 text-slate-500 hover:bg-mist'
          }`}
        >
          <IconCash size={16} /> Cash
        </button>
        <button
          onClick={() => setPaymentMethod('MOMO')}
          className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
            paymentMethod === 'MOMO'
              ? 'border-amber-500 bg-amber-50 text-amber-700'
              : 'border-slate-200 text-slate-500 hover:bg-mist'
          }`}
        >
          <IconPhone size={16} /> MoMo
        </button>
      </div>

      {paymentMethod === 'MOMO' && (
        <select
          value={momoNetwork}
          onChange={(e) => setMomoNetwork(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
        >
          <option value="MTN">MTN MoMo</option>
          <option value="VODAFONE">Telecel / Vodafone Cash</option>
          <option value="AT">AT Money</option>
        </select>
      )}

      {error && (
        <p className="flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          <IconAlert size={14} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      {/* Totals + charge */}
      <div className="space-y-1 border-t border-dashed border-slate-200 pt-3 text-sm">
        <div className="flex justify-between text-slate-500">
          <span>Subtotal</span><span>{ghs(subtotal)}</span>
        </div>
        {redeemPoints > 0 && (
          <div className="flex justify-between font-medium text-emerald-brand">
            <span>Points discount</span><span>- {ghs(Math.min(discountPreview, subtotal))}</span>
          </div>
        )}
        <div className="flex justify-between text-lg font-extrabold text-charcoal">
          <span>Total</span><span>{ghs(total)}</span>
        </div>
      </div>

      <button
        onClick={checkout}
        disabled={busy || cart.length === 0}
        className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-bold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? <IconSpinner size={17} /> : <IconCheck size={17} />}
        Charge {ghs(total)}
      </button>
    </div>
  );
}



