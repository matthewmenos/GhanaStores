import React, { useMemo, useState } from 'react';
import { Minus, Plus, Trash2, Smartphone, Banknote, WifiOff } from 'lucide-react';

/**
 * POSCart — the quick terminal register used by cashiers at the counter.
 * Works fully offline: if navigator.onLine is false, sales queue locally
 * (via the PWA's Workbox background-sync cache) and sync once the
 * connection returns, so a merchant never loses a sale to a bad signal.
 */
export default function POSCart({ lineItems = [], onQuantityChange, onRemove, onCheckout, isOffline }) {
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const subtotal = useMemo(
    () => lineItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [lineItems]
  );

  async function handleCheckout() {
    if (lineItems.length === 0) return;
    setIsSubmitting(true);
    try {
      await onCheckout?.({ paymentMethod, subtotal });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex h-full flex-col rounded-xl2 border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-950">Current sale</h3>
        {isOffline && (
          <span className="flex items-center gap-1 rounded-full bg-warning-50 px-2 py-0.5 text-xs font-medium text-warning">
            <WifiOff size={12} /> Offline — will sync
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2">
        {lineItems.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">Scan or tap a product to add it here.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {lineItems.map((item) => (
              <li key={item.variantId} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-slate-950">{item.name}</p>
                  {item.variantLabel && <p className="text-xs text-slate-500">{item.variantLabel}</p>}
                  <p className="text-xs text-slate-500 tabular-nums">GHS {item.unitPrice.toFixed(2)} each</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    aria-label="Decrease quantity"
                    onClick={() => onQuantityChange?.(item.variantId, Math.max(1, item.quantity - 1))}
                    className="rounded-md border border-slate-200 p-1 hover:bg-slate-50"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-6 text-center text-sm tabular-nums">{item.quantity}</span>
                  <button
                    aria-label="Increase quantity"
                    onClick={() => onQuantityChange?.(item.variantId, item.quantity + 1)}
                    className="rounded-md border border-slate-200 p-1 hover:bg-slate-50"
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    aria-label="Remove item"
                    onClick={() => onRemove?.(item.variantId)}
                    className="rounded-md p-1 text-danger hover:bg-red-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-100 px-4 py-3">
        <div className="mb-3 flex items-center justify-between text-base font-semibold text-slate-950">
          <span>Total</span>
          <span className="tabular-nums">GHS {subtotal.toFixed(2)}</span>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => setPaymentMethod('CASH')}
            className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium transition-colors ${
              paymentMethod === 'CASH' ? 'border-brand bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'
            }`}
          >
            <Banknote size={16} /> Cash
          </button>
          <button
            onClick={() => setPaymentMethod('MOMO')}
            className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium transition-colors ${
              paymentMethod === 'MOMO' ? 'border-brand bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'
            }`}
          >
            <Smartphone size={16} /> MoMo
          </button>
        </div>

        <button
          onClick={handleCheckout}
          disabled={lineItems.length === 0 || isSubmitting}
          className="w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? 'Processing…' : `Charge GHS ${subtotal.toFixed(2)}`}
        </button>
      </div>
    </div>
  );
}
