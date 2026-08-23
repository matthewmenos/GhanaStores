/**
 * ThemeCustomizer - expanded LIVE STOREFRONT PREVIEW CANVAS (multi-page).
 *
 * WordPress-style site editor surface: the sidebar accordion panel in
 * DashboardLayout owns every token; this module renders the simulated
 * device frame and routes between six storefront pages - Home, Shop,
 * Product, Cart, About Us, Contact Us - all styled by the same tokens.
 * In-frame navigation links switch pages exactly like a real storefront.
 *
 * State sync: DashboardLayout persists edits to localStorage and
 * broadcasts `gs:theme-preview` CustomEvents; this page mirrors them live.
 * `advanced.custom_css` is scoped to [data-gs-preview] so user CSS can
 * never leak into the surrounding dashboard.
 *
 * STRICT RULE: pure SVG / Lucide React icons ONLY - ZERO emojis.
 */
import { useEffect, useRef, useState } from 'react';
import { ghs } from '../api.js';
import {
  IconStore, IconWhatsApp, IconCart,
  IconShield, IconTruck, IconWallet,
} from '../components/icons.jsx';
import {
  Eye, Home, LayoutGrid, Package, ShoppingCart, Info, Mail,
  Search, MapPin, Phone, Star, Minus, Plus, Trash2,
  Instagram, Facebook, Music2, Send, CreditCard, ChevronRight, MessageCircle,
} from 'lucide-react';
import ViewportBar, { DEVICE_PRESETS, useElementSize } from '../components/ViewportBar.jsx';

/* ----------------------------- Token vocabulary ---------------------------- */
const FONT_OPTIONS = [
  { value: 'Inter', label: 'Inter', stack: "'Inter', system-ui, -apple-system, sans-serif" },
  { value: 'Poppins', label: 'Poppins', stack: "'Poppins', system-ui, sans-serif" },
  { value: 'Outfit', label: 'Outfit', stack: "'Outfit', system-ui, sans-serif" },
  { value: 'Plus Jakarta Sans', label: 'Plus Jakarta Sans', stack: "'Plus Jakarta Sans', system-ui, sans-serif" },
];

/** Deep customization token schema with safe fallback defaults. */
export const DEFAULT_CUSTOM_THEME_CONFIG = {
  branding: {
    site_title: 'My Ghana Store',
    tagline: 'Quality goods, delivered nationwide',
    logo_url: '',
    favicon_url: '',
  },
  typography: {
    font_family: 'Inter',
    heading_weight: '700',
    body_size: 16,
  },
  colors: {
    primary: '#0B6E4F',
    background: '#FFFFFF',
    surface: '#F8FAFC',
    text: '#0F172A',
    accent: '#F59E0B',
  },
  features: {
    enable_whatsapp_buy: true,
    whatsapp_number: '233201234567',
    whatsapp_custom_message: 'Hello! I would like to buy',
    enable_trust_badges: true,
    enable_hero_banner: true,
    enable_stock_counter: false,
  },
  layout: {
    border_radius: '0.75rem',
    product_grid_columns: 3,
    header_style: 'left_aligned',
  },
  header: {
    sticky: false,
    show_search: true,
    announcement_enabled: true,
    announcement_text: 'Free nationwide delivery on orders over GHS 500',
  },
  footer: {
    columns: 3,
    blurb: 'Quality goods, honestly priced, delivered to your doorstep anywhere in Ghana.',
    copyright: '(c) 2026 My Ghana Store. All rights reserved.',
    show_social: true,
    show_payments: true,
  },
  social: {
    instagram: true,
    facebook: true,
    tiktok: false,
  },
  product_page: {
    breadcrumbs: true,
    quantity_stepper: true,
    related_products: true,
    reviews: true,
  },
  pages_content: {
    about_title: 'Our Story',
    about_body: 'From the markets of Accra to your doorstep - we source authentic Ghanaian goods directly from makers and farmers, so every purchase supports local families.',
    contact_email: 'hello@myghanastore.com',
    contact_phone: '+233 20 123 4567',
    contact_address: '12 Oxford Street, Osu - Accra, Ghana',
  },
  advanced: {
    custom_css: '',
  },
};

/** Merge stored config onto safe defaults (deep merge, scalars win). */
export function normalizeCustomThemeConfig(raw) {
  const merge = (base, override) => {
    if (base == null || typeof base !== 'object') return override;
    if (override == null || typeof override !== 'object') return override;
    const out = Array.isArray(base) ? [...base] : { ...base };
    for (const k of Object.keys(override || {})) out[k] = merge(base[k], override[k]);
    return out;
  };
  return merge(DEFAULT_CUSTOM_THEME_CONFIG, raw || {});
}

/** Extract customizer tokens from the currently published theme config. */
export function seedConfigFromTheme(themeConfig) {
  const c = themeConfig || {};
  const pal = c.palette || {};
  return normalizeCustomThemeConfig({
    branding: {
      site_title: c.seo?.defaultTitle || '',
      tagline: c.hero?.subtitle || '',
    },
    typography: {
      font_family: c.typography?.font_family?.split(',')[0]?.trim().replace(/'/g, '') || '',
      heading_weight: String(c.typography?.headingWeight ?? c.typography?.heading_weight ?? ''),
      body_size: Number(c.typography?.bodySize ?? c.typography?.body_size ?? 0) || undefined,
    },
    colors: { primary: pal.primary || '', background: pal.background || '', text: pal.textPrimary || '', accent: pal.accent || '' },
    layout: { border_radius: c.borderRadius?.base || '', product_grid_columns: Number(c.layout?.gridColumns) || undefined },
  });
}

/* ------------------------- Multi-page preview model ------------------------ */
export const PAGE_TABS = [
  { key: 'home', label: 'Home', Icon: Home },
  { key: 'shop', label: 'Shop', Icon: LayoutGrid },
  { key: 'product', label: 'Product', Icon: Package },
  { key: 'cart', label: 'Cart', Icon: ShoppingCart },
  { key: 'about', label: 'About Us', Icon: Info },
  { key: 'contact', label: 'Contact', Icon: Mail },
];

/**
 * Scope merchant "Additional CSS" under the preview root selector so raw
 * rules can never bleed into the dashboard shell. Supports top-level
 * rules and @media blocks; comments are stripped first.
 */
function scopeCss(css) {
  if (!css || !css.trim()) return '';
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const scope = '[data-gs-preview]';
  const out = [];
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open < 0) break;
    const sel = src.slice(i, open).trim();
    const close = src.indexOf('}', open);
    if (close < 0) break;
    const body = src.slice(open + 1, close);
    if (sel.startsWith('@media')) out.push(`${sel}{${scopeCss(body).split(scope + ' ').join('')}}`);
    else if (sel.startsWith('@')) out.push(`${sel}{${body}}`);
    else if (sel) out.push(`${sel.split(',').map((x) => `${scope} ${x.trim()}`).join(',')}{${body}}`);
    i = close + 1;
  }
  return out.join('\n');
}

/* --------------------------- Live preview canvas --------------------------- */
const DEMO_PRODUCTS = [
  { id: 1, name: 'Kente Cloth Scarf', price: 180, img: 'https://picsum.photos/seed/kente/400/300', stock: 3 },
  { id: 2, name: 'Ankara Print Dress', price: 250, img: 'https://picsum.photos/seed/ankara/400/300', stock: 12 },
  { id: 3, name: 'Shea Butter 250g', price: 45, img: 'https://picsum.photos/seed/shea/400/300', stock: 7 },
  { id: 4, name: 'Bolga Basket', price: 110, img: 'https://picsum.photos/seed/bolga/400/300', stock: 2 },
  { id: 5, name: 'Solar Power Bank', price: 280, img: 'https://picsum.photos/seed/solar/400/300', stock: 9 },
  { id: 6, name: 'Adinkra Wall Art', price: 210, img: 'https://picsum.photos/seed/adinkra/400/300', stock: 5 },
];

/* Derived preview context shared by every page body. */
function useTokens(config, viewportWidth) {
  const compact = viewportWidth != null && viewportWidth > 0 && viewportWidth < 480;
  const narrow = viewportWidth != null && viewportWidth >= 480 && viewportWidth < 768;
  const centered = config.layout.header_style === 'centered' || narrow || compact;
  return {
    c: config,
    compact,
    narrow,
    centered,
    gridColumns: Math.min(config.layout.product_grid_columns, compact ? 2 : narrow ? 3 : 4),
    footColumns: Math.min(config.footer.columns, compact ? 1 : narrow ? 2 : 4),
    fontStack: (FONT_OPTIONS.find((f) => f.value === config.typography.font_family) || FONT_OPTIONS[0]).stack,
    waDigits: String(config.features.whatsapp_number || '').replace(/\D/g, ''),
    btn: () => `${config.buttons?.shadow === false ? '' : 'shadow'} ${config.buttons?.uppercase ? 'uppercase tracking-wide' : ''}`,
  };
}

function ProductCard({ p, t, onNavigate }) {
  const { c, waDigits, btn } = t;
  return (
    <article
      className="overflow-hidden border border-slate-200/70 shadow-sm transition-shadow duration-300 hover:shadow-md"
      style={{ borderRadius: 'var(--radius)', background: 'var(--surface)' }}
    >
      <button type="button" onClick={() => onNavigate('product')} className="relative block aspect-[4/3] w-full overflow-hidden">
        <img src={p.img} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
        {c.features.enable_stock_counter && p.stock <= 5 && (
          <span className="absolute left-2 top-2 rounded-md px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide" style={{ background: 'var(--accent)', color: '#0F172A' }}>
            Only {p.stock} left
          </span>
        )}
      </button>
      <div className="space-y-1.5 p-3">
        <h3 className="truncate text-sm font-bold">{p.name}</h3>
        <p className="text-sm font-extrabold" style={{ color: 'var(--primary)' }}>{ghs(p.price)}</p>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          <button
            type="button"
            className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-white transition-transform duration-200 hover:-translate-y-0.5 ${btn()}`}
            style={{ background: 'var(--primary)', borderRadius: 'var(--radius)' }}
          >
            Buy Now
          </button>
          {c.features.enable_whatsapp_buy && (
            <a
              href={waDigits ? `https://wa.me/${waDigits}?text=${encodeURIComponent(`${c.features.whatsapp_custom_message} ${p.name}`)}` : undefined}
              target="_blank"
              rel="noreferrer"
              title={waDigits ? 'WhatsApp Quick Buy' : 'Set a WhatsApp number first'}
              className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-bold ${waDigits ? 'border-emerald-500 text-emerald-600' : 'pointer-events-none border-slate-200 text-slate-300'}`}
              style={{ borderRadius: 'var(--radius)' }}
            >
              <IconWhatsApp size={12} /> Quick Buy
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

const NAV_LINKS = [
  { key: 'home', label: 'Home' },
  { key: 'shop', label: 'Shop' },
  { key: 'about', label: 'About Us' },
  { key: 'contact', label: 'Contact' },
];

function PreviewHeader({ t, active, onNavigate }) {
  const { c, compact, centered } = t;
  const h = c.header || {};
  return (
    <div className={h.sticky ? 'sticky top-0 z-20 backdrop-blur' : ''} style={{ background: h.sticky ? 'color-mix(in srgb, var(--bg) 92%, transparent)' : 'transparent' }}>
      {h.announcement_enabled && h.announcement_text ? (
        <div className="px-3 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider" style={{ background: 'var(--accent)', color: '#0F172A' }}>
          {h.announcement_text}
        </div>
      ) : null}
      <header
        className={`flex items-center gap-3 border-b px-5 py-3 ${compact ? 'px-3 py-2.5' : ''} ${centered ? 'flex-col justify-center gap-2' : 'justify-between'}`}
        style={{ borderColor: 'rgba(148,163,184,.25)' }}
      >
        <button type="button" onClick={() => onNavigate('home')} className={`flex items-center gap-2.5 ${centered ? 'flex-col' : ''}`}>
          {c.branding.logo_url ? (
            <img src={c.branding.logo_url} alt="" className="h-8 w-8 rounded object-contain" />
          ) : (
            <span className="rounded-lg p-1.5" style={{ background: 'var(--primary)', color: '#fff' }}><IconStore size={16} /></span>
          )}
          <span className={centered ? 'text-center' : ''}>
            <span className="block text-sm font-extrabold leading-tight" style={{ fontWeight: c.typography.heading_weight }}>{c.branding.site_title}</span>
            {c.branding.tagline ? <span className={`block text-[10px] opacity-70 ${compact ? 'max-w-[180px] truncate' : ''}`}>{c.branding.tagline}</span> : null}
          </span>
        </button>
        <div className={`flex items-center ${compact ? 'gap-1.5' : 'gap-3'}`}>
          {h.show_search && <Search size={15} className="opacity-60" aria-label="Search products" />}
          <button
            type="button"
            onClick={() => onNavigate('cart')}
            aria-label="Open cart page"
            className={`rounded-lg text-xs font-bold text-white transition-transform duration-200 hover:-translate-y-0.5 ${compact ? 'px-2 py-1.5' : 'px-3 py-2'} ${t.btn()}`}
            style={{ background: 'var(--primary)', borderRadius: 'var(--radius)' }}
          >
            <IconCart size={14} className="inline" /> Cart (2)
          </button>
        </div>
      </header>
      <nav className={`flex flex-wrap items-center gap-1 border-b px-3 py-1.5 ${compact ? 'justify-center' : ''}`} style={{ borderColor: 'rgba(148,163,184,.18)' }} aria-label="Storefront pages">
        {NAV_LINKS.map(({ key, label }) => {
          const on = active === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onNavigate(key)}
              aria-current={on ? 'page' : undefined}
              className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${on ? '' : 'hover:bg-black/5'}`}
              style={on ? { background: 'var(--primary)', color: '#fff' } : { color: 'var(--text)' }}
            >
              {label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function PreviewFooter({ t }) {
  const { c, footColumns } = t;
  const f = c.footer || {};
  return (
    <footer style={{ borderColor: 'rgba(148,163,184,.3)' }} className="border-t">
      <div className="grid gap-6 px-5 py-6" style={{ gridTemplateColumns: `repeat(${footColumns}, minmax(0,1fr))` }}>
        <div className="space-y-2">
          <p className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>{c.branding.site_title}</p>
          <p className="text-[11px] leading-relaxed opacity-70">{f.blurb}</p>
          {f.show_social && (
            <div className="flex gap-2 pt-1">
              {c.social.instagram && <Instagram size={15} aria-label="Instagram" />}
              {c.social.facebook && <Facebook size={15} aria-label="Facebook" />}
              {c.social.tiktok && <Music2 size={15} aria-label="TikTok" />}
              {c.features.enable_whatsapp_buy && <MessageCircle size={15} aria-label="WhatsApp" />}
            </div>
          )}
        </div>
        <nav className="space-y-1.5 text-[11px] font-semibold opacity-80" aria-label="Footer links">
          <p className="text-xs font-extrabold uppercase tracking-wide opacity-100">Shop</p>
          {['All Products', 'New Arrivals', 'Best Sellers'].map((x) => <span key={x} className="block">{x}</span>)}
        </nav>
        <nav className="space-y-1.5 text-[11px] font-semibold opacity-80" aria-label="Company links">
          <p className="text-xs font-extrabold uppercase tracking-wide opacity-100">Company</p>
          {['About Us', 'Contact', 'Delivery & Returns'].map((x) => <span key={x} className="block">{x}</span>)}
        </nav>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-2.5 text-[10px] font-semibold opacity-75" style={{ borderColor: 'rgba(148,163,184,.25)' }}>
        <span>{f.copyright}</span>
        {f.show_payments && (
          <span className="flex items-center gap-1.5">
            <CreditCard size={12} /> MoMo · Visa · Mastercard
          </span>
        )}
      </div>
    </footer>
  );
}

/* ------------------------------ Page bodies ------------------------------- */
function TrustStrip({ t }) {
  const { c } = t;
  if (!c.features.enable_trust_badges) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t px-4 py-4 text-[11px] font-bold" style={{ borderColor: 'rgba(148,163,184,.3)' }}>
      <span className="flex items-center gap-1.5"><IconShield size={14} style={{ color: 'var(--primary)' }} /> GH Secured</span>
      <span className="flex items-center gap-1.5"><IconTruck size={14} style={{ color: 'var(--primary)' }} /> 24-hr delivery</span>
      <span className="flex items-center gap-1.5"><IconWallet size={14} style={{ color: 'var(--primary)' }} /> MoMo accepted</span>
    </div>
  );
}

function HomeBody({ t, onNavigate }) {
  const { c, compact, gridColumns } = t;
  return (
    <>
      {c.features.enable_hero_banner && (
        <section className={`text-center ${compact ? 'px-4 py-7' : 'px-6 py-9'}`} style={{ background: 'linear-gradient(125deg, var(--primary) 0%, var(--accent) 165%)', color: '#fff' }}>
          <h1 className={`${compact ? 'text-lg' : 'text-xl sm:text-2xl'} font-extrabold`} style={{ fontWeight: c.typography.heading_weight }}>
            {c.branding.site_title}
          </h1>
          <p className="mx-auto mt-1.5 max-w-md text-sm opacity-90">{c.branding.tagline || 'Shop our latest arrivals'}</p>
          <button
            type="button"
            onClick={() => onNavigate('shop')}
            className={`mt-4 rounded-lg px-4 py-2 text-xs font-bold text-white transition-transform duration-200 hover:-translate-y-0.5 ${t.btn()}`}
            style={{ background: 'rgba(255,255,255,.16)', borderRadius: 'var(--radius)', border: '1px solid rgba(255,255,255,.45)' }}
          >
            Shop Now <ChevronRight size={12} className="inline" />
          </button>
        </section>
      )}
      <section className="p-5" aria-label="Featured products">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-base font-extrabold">Featured products</h2>
          <button type="button" onClick={() => onNavigate('shop')} className="text-[11px] font-bold underline opacity-70">View all</button>
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0,1fr))` }}>
          {DEMO_PRODUCTS.slice(0, 6).map((p) => <ProductCard key={p.id} p={p} t={t} onNavigate={onNavigate} />)}
        </div>
      </section>
      <TrustStrip t={t} />
    </>
  );
}

function ShopBody({ t }) {
  const { compact, narrow, gridColumns } = t;
  const cats = ['All', 'Textiles', 'Beauty', 'Craft', 'Gadgets'];
  return (
    <section className="p-5" aria-label="Shop catalog">
      <nav className="mb-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide opacity-60" aria-label="Breadcrumb">
        <span>Home</span> <ChevronRight size={10} /> <span>Shop</span>
      </nav>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-extrabold">All Products <span className="text-xs font-bold opacity-50">({DEMO_PRODUCTS.length})</span></h1>
        <select aria-label="Sort products" className="rounded-md border px-2 py-1 text-[11px] font-semibold" style={{ borderColor: 'rgba(148,163,184,.4)', background: 'var(--surface)', color: 'var(--text)' }}>
          <option>Sort: Featured</option><option>Price: Low to High</option><option>Newest</option>
        </select>
      </div>
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Categories">
        {cats.map((x, i) => (
          <span
            key={x}
            role="tab"
            aria-selected={i === 0}
            className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${i === 0 ? 'text-white' : ''}`}
            style={i === 0 ? { background: 'var(--primary)' } : { background: 'var(--surface)', color: 'var(--text)' }}
          >
            {x}
          </span>
        ))}
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(gridColumns, narrow ? 3 : 4)}, minmax(0,1fr))` }}>
        {DEMO_PRODUCTS.map((p) => <ProductCard key={p.id} p={p} t={t} onNavigate={() => {}} />)}
      </div>
      <div className="mt-5 flex justify-center gap-1.5" aria-label="Pagination">
        {[1, 2, 3].map((n) => (
          <span key={n} className={`grid h-7 w-7 place-items-center rounded-md text-[11px] font-bold ${n === 1 ? 'text-white' : ''}`} style={n === 1 ? { background: 'var(--primary)' } : { background: 'var(--surface)', color: 'var(--text)' }}>{n}</span>
        ))}
      </div>
    </section>
  );
}

function Stars() {
  return (
    <span className="flex items-center gap-0.5" aria-label="Rated 4.8 out of 5">
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={12} className="text-amber-400" fill="currentColor" aria-hidden="true" />)}
    </span>
  );
}

function ProductBody({ t, onNavigate }) {
  const { c, compact, narrow, waDigits, btn } = t;
  const [qty, setQty] = useState(1);
  const pp = c.product_page || {};
  const p = DEMO_PRODUCTS[0];
  const stack = compact || narrow;
  return (
    <section className="p-5" aria-label="Product detail">
      {pp.breadcrumbs && (
        <nav className="mb-3 flex flex-wrap items-center gap-1 text-[10px] font-bold uppercase tracking-wide opacity-60" aria-label="Breadcrumb">
          <button type="button" onClick={() => onNavigate('home')} className="hover:underline">Home</button> <ChevronRight size={10} />
          <button type="button" onClick={() => onNavigate('shop')} className="hover:underline">Shop</button> <ChevronRight size={10} />
          <span>{p.name}</span>
        </nav>
      )}
      <div className={`gap-5 ${stack ? 'grid grid-cols-1' : 'flex'}`}>
        <img src={p.img} alt={p.name} className={`w-full rounded-lg object-cover shadow-sm ${stack ? '' : 'max-w-[46%]'}`} style={{ borderRadius: 'var(--radius)' }} />
        <div className="min-w-0 flex-1 space-y-3">
          {pp.reviews && <Stars />}
          <h1 className={`${compact ? 'text-base' : 'text-xl'} font-extrabold leading-tight`}>{p.name}</h1>
          <p className="text-lg font-extrabold" style={{ color: 'var(--primary)' }}>{ghs(p.price)}</p>
          <p className="text-xs leading-relaxed opacity-75">Handcrafted in Ghana with premium local materials. Ships within 24 hours nationwide with tracked delivery.</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {pp.quantity_stepper && (
              <span className="flex items-center rounded-lg border" style={{ borderColor: 'rgba(148,163,184,.5)' }}>
                <button type="button" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-2 py-1.5"><Minus size={12} /></button>
                <span className="min-w-6 text-center text-xs font-extrabold">{qty}</span>
                <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(99, q + 1))} className="px-2 py-1.5"><Plus size={12} /></button>
              </span>
            )}
            <button type="button" className={`flex-1 rounded-lg px-4 py-2 text-xs font-bold text-white transition-transform duration-200 hover:-translate-y-0.5 ${btn()}`} style={{ background: 'var(--primary)', borderRadius: 'var(--radius)' }}>
              Add to Cart
            </button>
            {c.features.enable_whatsapp_buy && (
              <a
                href={waDigits ? `https://wa.me/${waDigits}?text=${encodeURIComponent(`${c.features.whatsapp_custom_message} ${p.name}`)}` : undefined}
                target="_blank"
                rel="noreferrer"
                title={waDigits ? 'WhatsApp Quick Buy' : 'Set a WhatsApp number first'}
                className={`flex items-center justify-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold ${waDigits ? 'border-emerald-500 text-emerald-600' : 'pointer-events-none border-slate-200 opacity-50'}`}
                style={{ borderRadius: 'var(--radius)' }}
              >
                <IconWhatsApp size={13} /> WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>
      {pp.related_products && (
        <>
          <h2 className="mb-3 mt-6 text-sm font-extrabold uppercase tracking-wide">You may also like</h2>
          <div className={`grid gap-4 ${compact ? 'grid-cols-2' : 'grid-cols-4'}`}>
            {DEMO_PRODUCTS.slice(1, compact ? 3 : 5).map((x) => <ProductCard key={x.id} p={x} t={t} onNavigate={() => {}} />)}
          </div>
        </>
      )}
      <TrustStrip t={t} />
    </section>
  );
}

const CART_ITEMS = DEMO_PRODUCTS.slice(0, 2);

function CartBody({ t, onNavigate }) {
  const { compact } = t;
  const [qtys, setQtys] = useState(CART_ITEMS.map((i) => i.stock));
  const subtotal = CART_ITEMS.reduce((s, i, idx) => s + i.price * qtys[idx], 0);
  return (
    <section className="p-5" aria-label="Shopping cart">
      <h1 className="mb-4 text-lg font-extrabold">Your Cart</h1>
      <div className={`gap-5 ${compact ? 'grid grid-cols-1' : 'flex'}`}>
        <ul className="min-w-0 flex-1 space-y-3">
          {CART_ITEMS.map((item, idx) => (
            <li key={item.id} className="flex items-center gap-3 border-b pb-3" style={{ borderColor: 'rgba(148,163,184,.25)' }}>
              <img src={item.img} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold">{item.name}</span>
                <span className="block text-[11px] font-semibold" style={{ color: 'var(--primary)' }}>{ghs(item.price)}</span>
              </span>
              <span className="flex items-center rounded-md border" style={{ borderColor: 'rgba(148,163,184,.5)' }}>
                <button type="button" aria-label={`Decrease ${item.name}`} onClick={() => setQtys((q) => q.map((v, i2) => (i2 === idx ? Math.max(1, v - 1) : v)))} className="px-1.5 py-1"><Minus size={11} /></button>
                <span className="min-w-5 text-center text-[11px] font-extrabold">{qtys[idx]}</span>
                <button type="button" aria-label={`Increase ${item.name}`} onClick={() => setQtys((q) => q.map((v, i2) => (i2 === idx ? v + 1 : v)))} className="px-1.5 py-1"><Plus size={11} /></button>
              </span>
              <button type="button" aria-label={`Remove ${item.name}`} className="opacity-50 hover:opacity-100"><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
        <aside className={`${compact ? '' : 'w-56 shrink-0'} self-start rounded-lg border p-4`} style={{ borderRadius: 'var(--radius)', background: 'var(--surface)', borderColor: 'rgba(148,163,184,.35)' }}>
          <h2 className="mb-2 text-xs font-extrabold uppercase tracking-wide">Order Summary</h2>
          <dl className="space-y-1 text-[11px] font-semibold">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{ghs(subtotal)}</dd></div>
            <div className="flex justify-between"><dt>Delivery</dt><dd className="font-bold text-emerald-600">Free</dd></div>
            <div className="flex justify-between border-t pt-1 text-sm font-extrabold" style={{ borderColor: 'rgba(148,163,184,.35)' }}><dt>Total</dt><dd>{ghs(subtotal)}</dd></div>
          </dl>
          <button type="button" className={`mt-3 w-full rounded-lg px-3 py-2 text-xs font-bold text-white transition-transform duration-200 hover:-translate-y-0.5 ${t.btn()}`} style={{ background: 'var(--primary)', borderRadius: 'var(--radius)' }}>
            Checkout with MoMo
          </button>
          <button type="button" onClick={() => onNavigate('shop')} className="mt-2 block w-full text-center text-[10px] font-bold underline opacity-70">Continue shopping</button>
        </aside>
      </div>
    </section>
  );
}

function AboutBody({ t, onNavigate }) {
  const { c, compact } = t;
  const pc = c.pages_content || {};
  const stats = [
    { v: '10k+', k: 'Happy customers' },
    { v: '24hr', k: 'Nationwide delivery' },
    { v: '16', k: 'Regions served' },
  ];
  return (
    <>
      <section className={`text-center ${compact ? 'px-4 py-7' : 'px-6 py-9'}`} style={{ background: 'linear-gradient(125deg, var(--primary) 0%, var(--accent) 165%)', color: '#fff' }}>
        <h1 className={`${compact ? 'text-lg' : 'text-xl sm:text-2xl'} font-extrabold`} style={{ fontWeight: c.typography.heading_weight }}>
          {pc.about_title || 'Our Story'}
        </h1>
        <p className="mx-auto mt-1.5 max-w-md text-sm opacity-90">{c.branding.tagline}</p>
      </section>
      <section className="p-5">
        <p className="mx-auto max-w-lg text-center text-xs leading-relaxed opacity-80">{pc.about_body}</p>
        <div className="mt-5 grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.k} className="rounded-lg p-3 text-center" style={{ background: 'var(--surface)', borderRadius: 'var(--radius)' }}>
              <p className="text-base font-extrabold" style={{ color: 'var(--primary)' }}>{s.v}</p>
              <p className="text-[10px] font-bold uppercase tracking-wide opacity-60">{s.k}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-lg border p-4" style={{ borderColor: 'rgba(148,163,184,.35)', borderRadius: 'var(--radius)' }}>
          <h2 className="mb-1 text-xs font-extrabold uppercase tracking-wide">Why shop with us</h2>
          <ul className="space-y-1 text-[11px] font-semibold opacity-80">
            <li className="flex items-center gap-1.5"><IconShield size={12} style={{ color: 'var(--primary)' }} /> Buyer protection on every order</li>
            <li className="flex items-center gap-1.5"><IconTruck size={12} style={{ color: 'var(--primary)' }} /> Tracked same-day dispatch in Accra</li>
            <li className="flex items-center gap-1.5"><IconWallet size={12} style={{ color: 'var(--primary)' }} /> MoMo, cards and cash on delivery</li>
          </ul>
        </div>
        <div className="mt-5 text-center">
          <button type="button" onClick={() => onNavigate('shop')} className={`rounded-lg px-4 py-2 text-xs font-bold text-white transition-transform duration-200 hover:-translate-y-0.5 ${t.btn()}`} style={{ background: 'var(--primary)', borderRadius: 'var(--radius)' }}>
            Browse the collection
          </button>
        </div>
      </section>
    </>
  );
}

function ContactBody({ t }) {
  const { c, compact } = t;
  const pc = c.pages_content || {};
  const cards = [
    { Icon: Phone, label: 'Call us', value: pc.contact_phone },
    { Icon: Mail, label: 'Email', value: pc.contact_email },
    { Icon: MapPin, label: 'Visit us', value: pc.contact_address },
  ];
  return (
    <section className="p-5" aria-label="Contact us">
      <h1 className="text-lg font-extrabold">Contact Us</h1>
      <p className="mt-1 text-[11px] opacity-70">We reply within one business day.</p>
      <div className={`mt-4 grid gap-3 ${compact ? 'grid-cols-1' : 'grid-cols-3'}`}>
        {cards.map(({ Icon, label, value }) => (
          <div key={label} className="rounded-lg border p-3" style={{ borderRadius: 'var(--radius)', background: 'var(--surface)', borderColor: 'rgba(148,163,184,.35)' }}>
            <Icon size={16} style={{ color: 'var(--primary)' }} aria-hidden="true" />
            <p className="mt-1.5 text-[10px] font-extrabold uppercase tracking-wide opacity-60">{label}</p>
            <p className="break-words text-[11px] font-bold">{value}</p>
          </div>
        ))}
      </div>
      <form className="mt-5 space-y-2.5" onSubmit={(e) => e.preventDefault()} aria-label="Contact form">
        <div className={`grid gap-2.5 ${compact ? 'grid-cols-1' : 'grid-cols-2'}`}>
          <input type="text" placeholder="Your name" aria-label="Your name" className="w-full rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'rgba(148,163,184,.5)', background: 'var(--surface)', color: 'var(--text)' }} />
          <input type="email" placeholder="Email address" aria-label="Email address" className="w-full rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'rgba(148,163,184,.5)', background: 'var(--surface)', color: 'var(--text)' }} />
        </div>
        <textarea rows={3} placeholder="How can we help?" aria-label="Message" className="w-full rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'rgba(148,163,184,.5)', background: 'var(--surface)', color: 'var(--text)' }} />
        <button type="submit" className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white transition-transform duration-200 hover:-translate-y-0.5 ${t.btn()}`} style={{ background: 'var(--primary)', borderRadius: 'var(--radius)' }}>
          <Send size={12} /> Send message
        </button>
      </form>
      <div
        className="mt-5 flex h-32 items-center justify-center rounded-lg text-[11px] font-bold text-white"
        style={{ background: 'linear-gradient(135deg, var(--primary) 0%, #334155 130%)', borderRadius: 'var(--radius)' }}
        role="img"
        aria-label="Map showing store location"
      >
        <span className="flex items-center gap-1.5 opacity-90"><MapPin size={14} /> {pc.contact_address}</span>
      </div>
    </section>
  );
}

/* ------------------------------- Page router ------------------------------- */
const PAGE_BODIES = {
  home: HomeBody,
  shop: ShopBody,
  product: ProductBody,
  cart: CartBody,
  about: AboutBody,
  contact: ContactBody,
};

/**
 * Renders any storefront page inside the token-styled preview root.
 * Backward compatible: `page` defaults to 'home' and `onNavigate` is
 * optional (in-frame links become no-ops).
 */
export function LivePreview({ config, viewportWidth = null, page = 'home', onNavigate }) {
  const t = useTokens(config, viewportWidth);
  const Body = PAGE_BODIES[page] || HomeBody;
  const nav = onNavigate || (() => {});
  const scoped = scopeCss(config.advanced?.custom_css);
  const centeredRoot = t.centered;

  return (
    <div
      data-gs-preview=""
      className="h-full w-full overflow-y-auto overflow-x-hidden"
      style={{
        '--primary': config.colors.primary,
        '--bg': config.colors.background,
        '--surface': config.colors.surface,
        '--text': config.colors.text,
        '--accent': config.colors.accent,
        '--radius': config.layout.border_radius,
        background: 'var(--bg)',
        color: 'var(--text)',
        fontFamily: t.fontStack,
        fontSize: `${config.typography.body_size}px`,
      }}
      aria-label={`Live storefront preview - ${page} page`}
    >
      {scoped ? <style>{scoped}</style> : null}
      <PreviewHeader t={t} active={page} onNavigate={nav} />
      <main style={{ minHeight: '60%' }}>
        <Body t={t} onNavigate={nav} navigate={nav} centered={centeredRoot} />
      </main>
      <PreviewFooter t={t} />
    </div>
  );
}

/**
 * Expanded preview canvas page. Hydrates from the shell's cached working
 * copy, mirrors every `gs:theme-preview` broadcast in real time, and owns
 * the multi-page switcher strip (Home / Shop / Product / Cart / About /
 * Contact). The strip scrolls horizontally on narrow viewports.
 */
export default function ThemeCustomizer() {
  const readCachedConfig = () => {
    try {
      const raw = localStorage.getItem('gs_custom_theme');
      return raw ? normalizeCustomThemeConfig(JSON.parse(raw)) : DEFAULT_CUSTOM_THEME_CONFIG;
    } catch {
      return DEFAULT_CUSTOM_THEME_CONFIG;
    }
  };

  const [config, setConfig] = useState(readCachedConfig);
  const [device, setDevice] = useState('desktop');
  const [activePage, setActivePage] = useState('home');
  const frameRef = useRef(null);
  const frameSize = useElementSize(frameRef);

  useEffect(() => {
    const onPreviewUpdate = (e) => {
      if (e?.detail) setConfig(normalizeCustomThemeConfig(e.detail));
    };
    window.addEventListener('gs:theme-preview', onPreviewUpdate);
    return () => window.removeEventListener('gs:theme-preview', onPreviewUpdate);
  }, []);

  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-[560px] w-full">
      {/* EXPANDED canvas - consumes all remaining width beside the panel */}
      <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 shadow-inner">
        {/* Top device viewport toolbar */}
        <ViewportBar device={device} onDeviceChange={setDevice} measured={frameSize} />

        {/* Storefront page switcher - WordPress-style preview context tabs */}
        <div
          role="tablist"
          aria-label="Storefront pages"
          className="flex items-center gap-1 overflow-x-auto border-b border-slate-700/60 bg-slate-900 px-2 py-1.5"
        >
          {PAGE_TABS.map(({ key, label, Icon }) => {
            const on = activePage === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setActivePage(key)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                  on ? 'bg-white text-slate-900 shadow' : 'text-slate-300 hover:bg-white/10'
                }`}
              >
                <Icon size={12} aria-hidden="true" />
                {label}
              </button>
            );
          })}
          <span className="ml-auto hidden shrink-0 pl-2 pr-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 sm:inline">
            Preview context
          </span>
        </div>

        {/* Responsive frame container - centered with dynamic shading */}
        <div className="relative flex flex-1 items-start justify-center overflow-auto p-4 md:p-8">
          <span className="pointer-events-none absolute left-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-slate-900/80 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white md:left-8 md:top-8">
            <Eye size={11} /> Live Preview
          </span>

          {/* Simulated device frame - smooth size morphing between presets */}
          <div
            ref={frameRef}
            data-device={device}
            className={`shrink-0 overflow-hidden bg-white shadow-2xl ring-1 ring-black/40 drop-shadow-xl transition-all duration-300 ease-in-out ${DEVICE_PRESETS[device].className}`}
          >
            <LivePreview
              config={config}
              viewportWidth={frameSize.width}
              page={activePage}
              onNavigate={setActivePage}
            />
          </div>
        </div>
      </section>
    </div>
  );
}









