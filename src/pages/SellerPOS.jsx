import React, { useEffect, useState } from 'react';
import { Truck, CheckCircle2 } from 'lucide-react';
import POSCart from '../components/POSCart.jsx';
import { apiGet, apiPost } from '../lib/api.js';

/**
 * SellerPOS — the in-store register screen. Pairs the product grid
 * (left) with the running <POSCart /> (right), and surfaces the
 * "Rider Transit Balance" card for one-click end-of-day reconciliation.
 */
export default function SellerPOS() {
  const [products, setProducts] = useState([]);
  const [cartItems, setCartItems] = useState([]);
  const [riderBalance, setRiderBalance] = useState(0);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [lastReceiptId, setLastReceiptId] = useState(null);

  useEffect(() => {
    apiGet('/inventory/products').then(setProducts).catch(() => {});
    apiGet('/pos/rider-transit-balance').then((r) => setRiderBalance(r.riderTransitBalance)).catch(() => {});

    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  function addToCart(product, variant) {
    setCartItems((prev) => {
      const existing = prev.find((i) => i.variantId === variant.id);
      if (existing) {
        return prev.map((i) => (i.variantId === variant.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, {
        variantId: variant.id,
        name: product.name,
        variantLabel: variant.optionLabel,
        unitPrice: Number(variant.price),
        quantity: 1,
      }];
    });
  }

  function updateQuantity(variantId, quantity) {
    setCartItems((prev) => prev.map((i) => (i.variantId === variantId ? { ...i, quantity } : i)));
  }

  function removeItem(variantId) {
    setCartItems((prev) => prev.filter((i) => i.variantId !== variantId));
  }

  async function handleCheckout({ paymentMethod }) {
    const payload = {
      items: cartItems.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      paymentMethod,
    };
    const result = await apiPost('/pos/sales', payload);
    setLastReceiptId(result.orderId);
    setCartItems([]);
    apiGet('/inventory/products').then(setProducts).catch(() => {});
  }

  async function handleReconcile() {
    const result = await apiPost('/pos/reconcile-rider', {});
    setRiderBalance(0);
  }

  return (
    <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-[1fr_360px]">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-950">Point of sale</h1>
          <RiderTransitCard balance={riderBalance} onReconcile={handleReconcile} />
        </div>

        {lastReceiptId && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-success-50 px-3 py-2 text-sm text-success">
            <CheckCircle2 size={16} />
            Sale complete — receipt #{lastReceiptId.slice(0, 8).toUpperCase()} generated.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {products.flatMap((p) => p.variants.map((v) => (
            <button
              key={v.id}
              onClick={() => addToCart(p, v)}
              disabled={v.quantityOnHand <= 0}
              className="rounded-xl2 border border-slate-200 bg-white p-3 text-left transition-colors hover:border-brand disabled:cursor-not-allowed disabled:opacity-40"
            >
              <p className="text-sm font-medium text-slate-950">{p.name}</p>
              <p className="text-xs text-slate-500">{v.optionLabel}</p>
              <p className="mt-1 text-sm font-semibold text-brand tabular-nums">GHS {Number(v.price).toFixed(2)}</p>
              <p className="text-xs text-slate-400">{v.quantityOnHand} in stock</p>
            </button>
          )))}
        </div>
      </div>

      <div className="h-[70vh]">
        <POSCart
          lineItems={cartItems}
          onQuantityChange={updateQuantity}
          onRemove={removeItem}
          onCheckout={handleCheckout}
          isOffline={isOffline}
        />
      </div>
    </div>
  );
}

function RiderTransitCard({ balance, onReconcile }) {
  return (
    <div className="flex items-center gap-3 rounded-xl2 border border-slate-200 bg-white px-4 py-2">
      <Truck size={18} className="text-warning" />
      <div>
        <p className="text-xs text-slate-500">Rider transit balance</p>
        <p className="text-sm font-semibold text-slate-950 tabular-nums">GHS {balance.toFixed(2)}</p>
      </div>
      <button
        onClick={onReconcile}
        disabled={balance <= 0}
        className="ml-2 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-30"
      >
        Reconcile
      </button>
    </div>
  );
}
