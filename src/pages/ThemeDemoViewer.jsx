/**
 * ThemeDemoViewer - full-screen interactive live demo sandbox.
 * Route: /dashboard/themes/demo/:templateId
 * STRICT RULE: pure SVG / Lucide icons only, ZERO emojis.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ghs } from '../api.js';
import { navigate } from '../router.js';
import {
  IconStore, IconCheck, IconAlert, IconSpinner, IconWhatsApp,
  IconTruck, IconShield, IconWallet,
} from '../components/icons.jsx';
import {
  ArrowLeft, Monitor, Smartphone, Tablet, X, BadgeCheck, Star, Palette,
} from 'lucide-react';
import { templateToCustomizerTokens } from '../theme/config.js';

const CATEGORY_BADGES = {
  fashion: 'Fashion & Apparel',
  electronics: 'Electronics & Gadgets',
  beauty: 'Beauty & Cosmetics',
  marketplace: 'General Marketplace',
  groceries: 'Groceries & Supermarket',
};

const VIEWPORTS = [
  { key: 'desktop', label: 'Desktop', icon: Monitor, width: '100%', maxWidth: 1120 },
  { key: 'tablet', label: 'Tablet', icon: Tablet, width: 768, maxWidth: 768 },
  { key: 'mobile', label: 'Mobile', icon: Smartphone, width: 390, maxWidth: 390 },
];

const DELIVERY_NOTE = 'Same-day dispatch in Greater Accra';
const WHATSAPP_NUMBER = '233201234567';

function Stars({ value, size = 13 }) {
  const filled = Math.round(value);
  return (
    <span className="flex items-center gap-0.5" aria-label={`Rated ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          className={n <= filled ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}
        />
      ))}
    </span>
  );
}

/** Accessible product-detail dialog with WhatsApp checkout. */
function ProductDialog({ product, onClose, buyLink }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!product) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${product.name} details`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="relative">
          <img src={product.imageUrl} alt="" className="h-52 w-full object-cover" />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close product details"
            className="absolute right-3 top-3 rounded-full bg-white/95 p-1.5 text-slate-600 shadow transition hover:bg-white hover:text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X size={16} />
          </button>
          {product.badge && (
            <span className="absolute left-3 top-3 rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow">
              {product.badge}
            </span>
          )}
        </div>

        <div className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Stars value={product.rating} />
            <span className="text-xs font-medium text-slate-500">{product.reviewCount} reviews</span>
          </div>
          <h2 className="text-lg font-extrabold text-charcoal">{product.name}</h2>
          <p className="text-xs font-medium text-slate-500">{product.tagline}</p>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-charcoal">{ghs(product.price)}</span>
            <span className="text-sm font-medium text-slate-400 line-through">{ghs(product.compareAtPrice)}</span>
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-extrabold text-red-600">Save 20%</span>
          </div>

          <p className="text-sm leading-relaxed text-slate-600">{product.description}</p>

          <div className="flex flex-wrap gap-2 pt-1">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700">
              <IconTruck size={13} /> {DELIVERY_NOTE}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-600">
              <IconWallet size={13} /> MoMo or Cash
            </span>
          </div>

          <a
            href={buyLink(product)}
            target="_blank"
            rel="noreferrer"
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            <IconWhatsApp size={17} /> Buy now on WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
function StorefrontHeader({ config, viewport, cartCount, menuOpen, onToggleMenu }) {
  const pal = config.palette || {};
  const darkText = (pal.background || '#fff') !== '#FFFFFF';
  const isMobile = viewport === 'mobile';
  const links = ['Home', 'Shop', 'Delivery', 'Contact'];

  return (
    <>
      <header
        className="sticky top-0 z-20 flex h-14 items-center justify-between px-4 shadow-sm"
        style={{ background: pal.primary, color: darkText ? '#fff' : '#0F172A' }}
      >
        <span className="flex min-w-0 items-center gap-2 text-sm font-extrabold tracking-tight">
          <IconStore size={18} />
          <span className="max-w-[170px] truncate">{config.seo?.defaultTitle || 'DiDwa'}</span>
        </span>

        {!isMobile && (
          <nav aria-label="Store sections" className="hidden items-center gap-5 text-[11px] font-bold uppercase tracking-wide sm:flex">
            {links.map((l) => (
              <a key={l} href="#top" onClick={(e) => e.preventDefault()} className="opacity-90 transition hover:opacity-100">{l}</a>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-3">
          <span className="hidden text-xs font-bold sm:block" style={{ color: pal.accent }}>Cart ({cartCount})</span>
          {isMobile && (
            <button
              type="button"
              onClick={onToggleMenu}
              aria-expanded={menuOpen}
              aria-controls="demo-mobile-nav"
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="rounded p-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              {menuOpen ? (
                <X size={19} />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M3 6h18M3 12h18M3 18h18" />
                </svg>
              )}
            </button>
          )}
        </div>
      </header>

      {/* Mobile slide-in navigation (clipped to the sandbox shell) */}
      <div
        className={`absolute inset-0 z-30 ${menuOpen ? '' : 'pointer-events-none'}`}
        aria-hidden={!menuOpen}
        style={{ visibility: menuOpen ? 'visible' : 'hidden', transition: 'visibility .3s' }}
      >
        <div
          className={`absolute inset-0 bg-slate-900/50 transition-opacity duration-300 ${menuOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={onToggleMenu}
          aria-hidden="true"
        />
        <nav
          id="demo-mobile-nav"
          aria-label="Store sections"
          className={`absolute left-0 top-0 h-full w-64 max-w-[80vw] pt-14 shadow-2xl transition-transform duration-300 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
          style={{ background: pal.secondary || pal.primary, color: '#fff' }}
          aria-hidden={!menuOpen}
        >
          <ul className="space-y-1 px-3 text-sm font-bold">
            {links.map((l) => (
              <li key={l}>
                <a
                  href="#top"
                  onClick={(e) => { e.preventDefault(); if (menuOpen) onToggleMenu(); }}
                  className="block rounded-lg px-3 py-2.5 transition hover:bg-white/10"
                >
                  {l}
                </a>
              </li>
            ))}
          </ul>
          <div className="mx-3 mt-6 rounded-xl bg-white/10 p-3 text-[11px] font-semibold leading-relaxed">
            <span className="flex items-center gap-1.5"><IconTruck size={13} /> {DELIVERY_NOTE}</span>
            <span className="mt-2 flex items-center gap-1.5"><IconShield size={13} /> Buyer protection on every order</span>
          </div>
        </nav>
      </div>
    </>
  );
}
function StorefrontBody({ config, items, viewport, onSelect, onAddToCart }) {
  const pal = config.palette || {};
  const layout = config.layout || {};
  const br = config.borderRadius || {};
  const heroCfg = config.hero || {};
  const conv = config.conversion || {};
  const isMobile = viewport === 'mobile';
  const cols = isMobile ? 2 : layout.gridColumns || 3;
  const radius = br.base || '0.5rem';

  return (
    <div style={{ background: pal.background || '#fff', color: pal.textPrimary || '#0F172A' }}>
      {layout.heroBanner && (
        <section
          className="relative overflow-hidden px-5 py-10 text-center sm:py-14"
          style={{
            background: `linear-gradient(125deg, ${pal.primary} 0%, ${pal.secondary} 55%, ${pal.accent} 165%)`,
            color: '#fff',
          }}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: pal.accent }}>
            {conv.urgencyTicker || 'Featured'}
          </p>
          <h1 className="mx-auto mt-2 max-w-md text-2xl font-extrabold leading-snug sm:text-3xl">
            {heroCfg.title}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm opacity-85">{heroCfg.subtitle}</p>
          <button
            type="button"
            onClick={() => onSelect(items[0])}
            className="mt-5 rounded-xl px-5 py-2.5 text-sm font-bold shadow-lg transition-transform duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            style={{ background: pal.accent, color: '#0F172A' }}
          >
            {heroCfg.callToAction || 'Shop now'}
          </button>
        </section>
      )}

      <section className="px-4 py-6 sm:px-6" aria-label="Products">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-base font-extrabold">Popular right now</h2>
          <span className="text-[11px] font-bold" style={{ color: pal.accent }}>{items.length} items</span>
        </div>

        <div className="grid gap-3 sm:gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
          {items.map((p) => (
            <article
              key={p.id}
              className="group cursor-pointer overflow-hidden border bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              style={{ borderRadius: radius, borderColor: 'rgba(148,163,184,.35)' }}
              onClick={() => onSelect(p)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(p); }
              }}
              tabIndex={0}
              role="button"
              aria-label={`View ${p.name}, priced ${ghs(p.price)}`}
            >
              <div className="relative aspect-[4/3] overflow-hidden">
                <img
                  src={p.imageUrl}
                  alt={p.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                {p.badge && (
                  <span
                    className="absolute left-2 top-2 rounded-md px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide shadow"
                    style={{ background: pal.accent, color: '#0F172A' }}
                  >
                    {p.badge}
                  </span>
                )}
              </div>

              <div className="p-2.5 sm:p-3">
                <h3 className="truncate text-xs font-bold sm:text-sm">{p.name}</h3>
                <p className="mt-0.5 truncate text-[10px] text-slate-500">{p.tagline}</p>

                <div className="mt-1.5 flex items-center justify-between gap-1">
                  <span className="text-sm font-extrabold">{ghs(p.price)}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onAddToCart(p); }}
                    aria-label={`Add ${p.name} to cart`}
                    className="rounded-lg p-1.5 shadow transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    style={{ background: pal.accent, color: '#0F172A' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                </div>

                <div className="mt-1.5 flex items-center gap-1">
                  <Stars value={p.rating} size={10} />
                  <span className="text-[10px] text-slate-400">({p.reviewCount})</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Trust strip */}
      <footer
        className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t px-4 py-5 text-[11px] font-bold"
        style={{ borderColor: 'rgba(148,163,184,.3)' }}
      >
        <span className="flex items-center gap-1.5"><IconShield size={14} style={{ color: pal.accent }} /> GH Secured checkout</span>
        <span className="flex items-center gap-1.5"><IconTruck size={14} style={{ color: pal.accent }} /> 24-hr nationwide delivery</span>
        <span className="flex items-center gap-1.5"><IconWallet size={14} style={{ color: pal.accent }} /> {(conv.mobileMoneyProviders || []).join(' / ') || 'MoMo accepted'}</span>
      </footer>
    </div>
  );
}

/** Perceived luminance of a hex color - flips foreground contrast on light accents. */
function paletteLuminance(hex) {
  const h = (hex || '#000').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Full-screen live demo engine for a single theme template. */
export default function ThemeDemoViewer({ templateId }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewport, setViewport] = useState('desktop');
  const [selected, setSelected] = useState(null);
  const [cartCount, setCartCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [published, setPublished] = useState(false);
  const [toast, setToast] = useState(null);
  const [isActiveTheme, setIsActiveTheme] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await api.get(`/api/themes/demo/${encodeURIComponent(templateId)}`);
      setData(res);
      setPublished(false);
      /* Resolve whether this demoed theme is the seller's ACTIVE theme
         (per requirement: once a theme is active, opening its preview
         reveals the Customizer button). */
      try {
        const mine = await api.get('/api/store/theme');
        setIsActiveTheme(Boolean(mine?.activeThemeId && mine.activeThemeId === res?.theme?.id));
      } catch {
        setIsActiveTheme(false);
      }
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => { load(); }, [load]);

  // Lock page scroll while the product dialog is open.
  useEffect(() => {
    document.body.style.overflow = selected ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [selected]);

  async function applyTheme() {
    if (applying || !data?.theme) return;
    setApplying(true);
    setToast(null);
    try {
      const res = await api.put('/api/store/theme', { active_theme_id: data.theme.id });
      setPublished(true);
      setToast({ ok: true, msg: res.message || 'Theme published.' });
    } catch (e) {
      setToast({ ok: false, msg: e.message });
    } finally {
      setApplying(false);
    }
  }

  function buyLink(product) {
    const msg = `Hello! I would like to order "${product.name}" (${ghs(product.price)}). Is it available?`;
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
  }

  /* Open the customizer pre-seeded with the ACTIVE theme (the one being
     previewed), never the default schema. */
  function openCustomizer() {
    const theme = data?.theme;
    if (!theme) {
      navigate('/dashboard/themes/customizer');
      return;
    }
    window.dispatchEvent(
      new CustomEvent('gs:open-customizer', {
        detail: templateToCustomizerTokens({ name: theme.name, config: theme.config }),
      }),
    );
    navigate('/dashboard/themes/customizer');
  }

  const vp = VIEWPORTS.find((v) => v.key === viewport) || VIEWPORTS[0];
  const cfg = data?.theme?.config || {};

  return (
    <div className="flex min-h-screen flex-col bg-slate-200/70">
      {/* Sticky admin preview bar */}
      <header className="sticky top-0 z-40 border-b border-slate-300 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between gap-2 px-3 sm:gap-4 sm:px-5">
          {/* Left - back + identity */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => { navigate('/dashboard/themes'); }}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Back to theme marketplace"
            >
              <ArrowLeft size={14} /> <span className="hidden sm:inline">Marketplace</span>
            </button>
            <div className="hidden min-w-0 md:block">
              <h1 className="truncate text-sm font-extrabold text-charcoal">
                {data?.theme?.name || 'Loading theme...'}
              </h1>
              {data?.theme && (
                <span className="mt-0.5 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                  {CATEGORY_BADGES[data.theme.category] || data.theme.category}
                </span>
              )}
            </div>
          </div>

          {/* Center - responsive viewport switcher */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Preview viewport">
            {VIEWPORTS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setViewport(key)}
                aria-pressed={viewport === key}
                title={`${label} preview`}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  viewport === key ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:text-charcoal'
                }`}
              >
                <Icon size={14} /> <span className="hidden lg:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Right - publish CTA + customizer */}
          <div className="flex shrink-0 items-center gap-2">
            {/* Customizer appears only when THIS theme is currently active */}
            {isActiveTheme && (
              <button
                type="button"
                onClick={openCustomizer}
                className="hidden items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:flex"
              >
                <Palette size={13} /> Customize
              </button>
            )}
            {toast && (
              <span
                role="status"
                aria-live="polite"
                className={`hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold sm:flex ${
                  toast.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                }`}
              >
                {toast.ok ? <IconCheck size={12} /> : <IconAlert size={12} />} {toast.msg}
              </span>
            )}
            <button
              type="button"
              onClick={applyTheme}
              disabled={applying || !data?.theme || published}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              {applying ? (
                <><IconSpinner size={15} className="animate-spin" /> Publishing...</>
              ) : published ? (
                <><BadgeCheck size={15} /> Published</>
              ) : (
                <>Apply Theme Now</>
              )}
            </button>
          </div>
        </div>
      </header>
      {/* Sandbox stage */}
      <main className="flex-1 overflow-x-hidden p-3 sm:p-6" aria-label="Live theme preview sandbox">
        {loading ? (
          <div className="flex h-[70vh] items-center justify-center gap-3 text-slate-400">
            <IconSpinner size={26} className="animate-spin" />
            <span className="text-sm font-medium">Preparing live demo...</span>
          </div>
        ) : loadError ? (
          <div className="mx-auto mt-16 max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center">
            <IconAlert size={26} className="mx-auto text-red-400" />
            <p className="mt-3 text-sm font-bold text-charcoal">Could not load the demo</p>
            <p className="mt-1 text-xs text-slate-500">{loadError}</p>
            <button
              type="button"
              onClick={load}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Try again
            </button>
          </div>
        ) : (
          <div
            className="relative mx-auto transition-all duration-500 ease-out"
            style={{ width: vp.width, maxWidth: vp.maxWidth }}
          >
            {/* Device chrome hint for tablet / mobile frames */}
            {viewport !== 'desktop' && (
              <div className="absolute -inset-2 rounded-[36px] border border-slate-300/80 bg-slate-900/[0.03]" aria-hidden="true" />
            )}

            {/* The storefront itself */}
            <div
              className="sandbox-shell relative overflow-hidden bg-white shadow-2xl"
              style={{ borderRadius: viewport === 'desktop' ? 16 : 34 }}
            >
              <div className="relative h-[calc(100vh-9.5rem)] min-h-[520px] overflow-y-auto overscroll-contain">
                <StorefrontHeader
                  config={cfg}
                  viewport={viewport}
                  cartCount={cartCount}
                  menuOpen={menuOpen}
                  onToggleMenu={() => setMenuOpen((o) => !o)}
                />
                <StorefrontBody
                  config={cfg}
                  items={data.sampleItems}
                  viewport={viewport}
                  onSelect={setSelected}
                  onAddToCart={() => setCartCount((c) => c + 1)}
                />
              </div>
            </div>

            <p className="mt-3 text-center text-[11px] font-semibold text-slate-500">
              {vp.label} · {typeof vp.width === 'number' ? `${vp.width}px` : 'Fluid'} · Click any product to explore checkout
            </p>
          </div>
        )}
      </main>

      {/* Product detail dialog */}
      {selected && (
        <ProductDialog product={selected} onClose={() => setSelected(null)} buyLink={buyLink} />
      )}
    </div>
  );
}