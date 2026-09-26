/** Live tenant storefront. Uses database inventory, never demo products. */
import { useEffect, useMemo, useState } from 'react';
import { api, ghs } from '../api.js';
import { normalizeCustomThemeConfig } from '../theme/config.js';
import { IconCart, IconWhatsApp, IconAlert, IconCheck } from '../components/icons.jsx';

const slugFromHost = () => {
  const host = window.location.hostname.toLowerCase();
  const platform = String(import.meta.env.VITE_PLATFORM_DOMAIN || '').replace(/^https?:\/\//, '').split('/')[0];
  if (platform && host.endsWith(`.${platform}`)) return host.slice(0, -(platform.length + 1)).split('.')[0];
  return host;
};

export default function LiveStorefront({ onPlatformHost = null }) {
  const [tenant, setTenant] = useState(null);
  const [products, setProducts] = useState([]);
  const [theme, setTheme] = useState(null);
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState({ name: '', phone: '', address: '' });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    // The server is authoritative about tenancy, so resolve the host FIRST and
    // only request catalogue/theme data once a tenant is confirmed. Firing all
    // three calls together let a rejected storefront-catalog request short
    // circuit Promise.all, so the isPlatformRoot branch never ran and a system
    // root rendered "Storefront not found" instead of the platform site.
    const fail = (text) => { if (live) setMessage(text); };
    (async () => {
      let resolved;
      try {
        resolved = await api.get('/api/domains/resolve');
      } catch {
        fail('Could not reach the store. Please try again.');
        return;
      }
      if (!live) return;
      // Apex / www / app / api (anything the server calls a system root) is
      // platform traffic. Hand control back so the marketing site renders; this
      // also makes a stale or missing VITE_PLATFORM_DOMAIN harmless.
      if (!resolved?.tenant) {
        if (resolved?.isPlatformRoot) { if (onPlatformHost) onPlatformHost(); return; }
        fail('Storefront not found.');
        return;
      }
      const slug = resolved.tenant.subdomainSlug || slugFromHost();
      setTenant(resolved.tenant);
      // A missing catalogue or theme must not blank a real store: degrade to an
      // empty catalogue and the default theme instead of an error screen.
      const [catalog, themed] = await Promise.all([
        api.get(`/api/domains/storefront/${encodeURIComponent(slug)}/products`).catch(() => null),
        api.get(`/api/store/theme/public/${encodeURIComponent(slug)}`).catch(() => null),
      ]);
      if (!live) return;
      setProducts(catalog?.products || []);
      if (themed?.theme?.config) setTheme(normalizeCustomThemeConfig(themed.theme.config));
    })();
    return () => { live = false; };
  }, []);

  const total = useMemo(() => cart.reduce((sum, line) => sum + Number(line.price) * line.quantity, 0), [cart]);
  const config = theme || normalizeCustomThemeConfig({ branding: { site_title: tenant?.name || 'DiDwa Store' } });
  const primary = config.colors.primary;

  function add(product, variant) {
    setCart((current) => {
      const found = current.find((line) => line.variantId === variant.id);
      if (found) return current.map((line) => line.variantId === variant.id ? { ...line, quantity: Math.min(line.quantity + 1, variant.stockQuantity) } : line);
      return [...current, { variantId: variant.id, name: product.name, label: variant.optionValue, price: variant.price, quantity: 1 }];
    });
  }

  async function checkout(event) {
    event.preventDefault();
    if (!cart.length || busy) return;
    setBusy(true); setMessage('');
    try {
      const result = await api.post('/api/public/orders', {
        slug: tenant?.subdomainSlug, customer_name: customer.name,
        customer_phone: customer.phone, customer_address: customer.address,
        payment_method: 'COD', items: cart.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
      });
      setMessage(`Order ${result.order.orderNumber} placed successfully. We will contact you to confirm delivery.`);
      setCart([]);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  if (!tenant && !message) return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading store...</div>;
  if (!tenant) return <div className="flex min-h-screen items-center justify-center text-red-600">{message}</div>;

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4"><div><h1 className="text-xl font-extrabold" style={{ color: primary }}>{tenant.name}</h1><p className="text-xs text-slate-500">Live storefront</p></div><span className="text-sm text-slate-600"><IconCart className="mr-1 inline" />{cart.length} items</span></div></header>
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[1fr_360px]">
      <section><h2 className="mb-4 text-lg font-bold">Shop</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => <article key={product.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{product.image_url && <img src={product.image_url} alt={product.name} className="h-40 w-full object-cover" />}<div className="p-4"><h3 className="font-bold">{product.name}</h3><p className="mt-1 text-xs text-slate-500">{product.description}</p><div className="mt-3 space-y-2">{(product.variants || []).map((variant) => <button key={variant.id} type="button" disabled={!variant.inStock} onClick={() => add(product, variant)} className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:border-blue-400 disabled:opacity-40"><span>{variant.optionValue}</span><span className="font-bold">{ghs(variant.price)}</span></button>)}</div></div></article>)}
        {!products.length && <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">This store has no products available yet.</p>}
      </div></section>
      <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 text-lg font-bold"><IconCart /> Your order</h2><div className="mt-4 space-y-3">{cart.map((line) => <div key={line.variantId} className="flex justify-between gap-3 text-sm"><span>{line.quantity} × {line.name} <small className="text-slate-400">{line.label}</small></span><span className="font-semibold">{ghs(line.price * line.quantity)}</span></div>)}{!cart.length && <p className="text-sm text-slate-500">Your cart is empty.</p>}</div><div className="mt-4 flex justify-between border-t pt-4 font-extrabold"><span>Total</span><span style={{ color: primary }}>{ghs(total)}</span></div>
        <form onSubmit={checkout} className="mt-5 space-y-3"><input required value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} placeholder="Your name" className="w-full rounded-lg border px-3 py-2 text-sm" /><input required value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} placeholder="Phone number" className="w-full rounded-lg border px-3 py-2 text-sm" /><textarea required value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} placeholder="Delivery address" className="w-full rounded-lg border px-3 py-2 text-sm" /><button disabled={!cart.length || busy} className="flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold text-white disabled:opacity-40" style={{ background: primary }}>{busy ? 'Placing order...' : 'Place COD order'} {!busy && <IconCheck size={16} />}</button></form>{message && <p className="mt-4 flex gap-2 text-sm text-slate-600"><IconAlert size={16} />{message}</p>}{tenant.whatsappNumber && <a href={`https://wa.me/${String(tenant.whatsappNumber).replace(/\D/g, '')}`} className="mt-4 flex items-center justify-center gap-2 text-sm text-emerald-700"><IconWhatsApp size={16} /> Chat with the store</a>}</aside>
    </main>
  </div>;
}
