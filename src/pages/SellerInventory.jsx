/**
 * Product & Multi-Variant Inventory manager (Module 6).
 * Create products with size/colour variants, per-variant stock and custom
 * re-order thresholds that drive automatic Arkesel low-stock SMS alerts.
 */
import { useEffect, useMemo, useState } from 'react';
import { api, ghs } from '../api.js';
import {
  IconPlus, IconSpinner, IconAlert, IconCheck, IconBox,
  IconSearch, IconTrash, IconCoins,
} from '../components/icons.jsx';

const EMPTY_VARIANT = { optionName: 'Size', optionValue: '', sku: '', priceOverride: '', stockQuantity: 0, lowStockThreshold: 5 };

export default function SellerInventory() {
  const [products, setProducts] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', category: 'General', price: '' });
  const [variants, setVariants] = useState([{ ...EMPTY_VARIANT }]);

  async function load() {
    try {
      const [p, l] = await Promise.all([
        api.get('/api/inventory/products'),
        api.get('/api/inventory/low-stock'),
      ]);
      setProducts(p.products || []);
      setLowStock(l.lowStock || []);
    } catch (e) {
      setFeedback({ ok: false, msg: e.message });
    }
  }
  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => `${p.name} ${p.category}`.toLowerCase().includes(q));
  }, [products, search]);

  function setVariant(idx, patch) {
    setVariants((prev) => prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  }

  async function createProduct(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      await api.post('/api/inventory/products', {
        ...form,
        price: Number(form.price),
        variants: variants
          .filter((v) => v.optionValue.trim() !== '')
          .map((v) => ({
            optionName: v.optionName || 'Default',
            optionValue: v.optionValue,
            sku: v.sku || undefined,
            priceOverride: v.priceOverride === '' ? undefined : Number(v.priceOverride),
            stockQuantity: Number(v.stockQuantity) || 0,
            lowStockThreshold: Number(v.lowStockThreshold) || 0,
          })),
      });
      setFeedback({ ok: true, msg: `${form.name} added to your catalog.` });
      setShowForm(false);
      setForm({ name: '', description: '', category: 'General', price: '' });
      setVariants([{ ...EMPTY_VARIANT }]);
      await load();
    } catch (err) {
      setFeedback({ ok: false, msg: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function adjust(variantId, delta) {
    setBusy(true);
    try {
      await api.patch(`/api/inventory/variants/${variantId}/stock`, { delta });
      await load();
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

      {/* Low-stock banner */}
      {lowStock.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-800">
            <IconAlert size={16} /> {lowStock.length} variant{lowStock.length === 1 ? '' : 's'} at or below re-order level
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {lowStock.slice(0, 8).map((v) => (
              <span key={v.id} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-800 shadow-sm">
                {v.product_name} - {v.option_value}: {v.stock_quantity} left (alert at {v.low_stock_threshold})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Header + new product */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          <IconBox size={17} className="text-blue-600" /> Catalog ({products.length})
        </h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search catalog..."
              className="w-48 rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-600" />
          </div>
          <button type="button" onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700">
            <IconPlus size={15} /> New product
          </button>
        </div>
      </div>

      {/* New product form */}
      {showForm && (
        <form onSubmit={createProduct} className="rounded-2xl border border-blue-100 bg-blue-50/40 p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Product name" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-600" />
            <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Category" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-600" />
            <input required type="number" min="0" step="0.01" value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              placeholder="Base price (GHS)" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-600" />
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Short description" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-600" />
          </div>

          <p className="mt-4 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
            <IconCoins size={14} className="text-blue-600" /> Variants (size, colour, SKU, re-order alert)
          </p>
          <div className="mt-2 space-y-2">
            {variants.map((v, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 md:grid-cols-6">
                <input value={v.optionName} onChange={(e) => setVariant(i, { optionName: e.target.value })}
                  placeholder="Option (Size)" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                <input required value={v.optionValue} onChange={(e) => setVariant(i, { optionValue: e.target.value })}
                  placeholder="Value (Large)" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                <input value={v.sku} onChange={(e) => setVariant(i, { sku: e.target.value })}
                  placeholder="SKU" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                <input type="number" min="0" step="0.01" value={v.priceOverride}
                  onChange={(e) => setVariant(i, { priceOverride: e.target.value })}
                  placeholder="Price override" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                <input type="number" min="0" value={v.stockQuantity} onChange={(e) => setVariant(i, { stockQuantity: e.target.value })}
                  placeholder="Stock" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                <div className="flex gap-2">
                  <input type="number" min="0" value={v.lowStockThreshold} onChange={(e) => setVariant(i, { lowStockThreshold: e.target.value })}
                    placeholder="Alert at" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  {variants.length > 1 && (
                    <button type="button" onClick={() => setVariants((p) => p.filter((_, x) => x !== i))}
                      className="rounded-lg bg-white p-2 text-slate-300 shadow-sm hover:text-red-600"><IconTrash size={15} /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <button type="button" onClick={() => setVariants((p) => [...p, { ...EMPTY_VARIANT }])}
              className="flex items-center gap-1 text-sm font-bold text-blue-600 hover:text-blue-800">
              <IconPlus size={14} /> Add variant
            </button>
            <button type="submit" disabled={busy}
              className="flex items-center gap-2 rounded-xl bg-emerald-brand px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-emerald-700 disabled:opacity-50">
              {busy ? <IconSpinner size={15} /> : <IconCheck size={15} />} Save product
            </button>
          </div>
        </form>
      )}

      {/* Catalog list */}
      <div className="space-y-3">
        {visible.map((p) => {
          const totalStock = (p.variants || []).reduce((s, v) => s + Number(v.stockQuantity || 0), 0);
          return (
            <div key={p.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
                <div>
                  <p className="font-bold text-charcoal">{p.name}</p>
                  <p className="text-xs text-slate-400">{p.category} - {p.variants?.length || 0} variants</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${totalStock === 0 ? 'bg-red-100 text-red-700' : totalStock <= 10 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>
                  {totalStock} in stock
                </span>
              </div>
              <div className="divide-y divide-slate-50">
                {(p.variants || []).map((v) => {
                  const stock = Number(v.stockQuantity);
                  const low = stock <= Number(v.lowStockThreshold);
                  return (
                    <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-charcoal">
                          {v.optionName}: {v.optionValue}
                          {v.sku && <span className="ml-2 font-mono text-xs text-slate-400">{v.sku}</span>}
                        </p>
                        <p className="text-xs text-slate-400">
                          {v.priceOverride != null ? `${ghs(Number(v.priceOverride))} variant price` : 'Base price'} - alert at {v.lowStockThreshold}
                          {low && ' - SMS sent'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`w-20 rounded-lg px-2 py-1 text-center text-xs font-bold ${stock === 0 ? 'bg-red-100 text-red-700' : low ? 'bg-amber-100 text-amber-800' : 'bg-mist text-charcoal'}`}>
                          {stock} units
                        </span>
                        <button type="button" onClick={() => adjust(v.id, -1)} disabled={busy}
                          className="rounded-lg bg-mist px-2.5 py-1.5 text-sm font-bold text-slate-600 hover:bg-red-50 hover:text-red-600 disabled:opacity-40">-</button>
                        <button type="button" onClick={() => adjust(v.id, 1)} disabled={busy}
                          className="rounded-lg bg-mist px-2.5 py-1.5 text-sm font-bold text-slate-600 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40">+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {visible.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center">
            <IconBox size={32} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-400">No products yet. Add your first product to start selling.</p>
          </div>
        )}
      </div>
    </div>
  );
}




