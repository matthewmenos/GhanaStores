/**
 * ThemeCustomizer - expanded LIVE STOREFRONT PREVIEW CANVAS.
 *
 * Editing controls live in the sidebar-replacing accordion panel owned by
 * DashboardLayout; this module renders ONLY the preview surface so it can
 * consume the entire flex-1 width beside the 380px control column:
 *
 *   - ViewportBar device toolbar (centered pill group + live pixel badge)
 *   - Fluid dark sandbox canvas with subtle gradient shading
 *   - Animated device frame (transition-all duration-300 ease-in-out)
 *
 * State sync: DashboardLayout persists every edit to localStorage and
 * broadcasts a `gs:theme-preview` CustomEvent; this page mirrors it in
 * real time, so merchants see keystroke-level updates while typing.
 *
 * Exports the shared token schema utilities consumed by DashboardLayout.
 *
 * STRICT RULE: pure SVG / Lucide React icons ONLY - ZERO emojis.
 */
import { useEffect, useRef, useState } from 'react';
import { ghs } from '../api.js';
import {
  IconStore, IconWhatsApp, IconCart,
  IconShield, IconTruck, IconWallet,
} from '../components/icons.jsx';
import { Eye } from 'lucide-react';
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
    colors: {
      primary: pal.primary || '',
      background: pal.background || '',
      text: pal.textPrimary || '',
      accent: pal.accent || '',
    },
    layout: {
      border_radius: c.borderRadius?.base || '',
      product_grid_columns: Number(c.layout?.gridColumns) || undefined,
    },
  });
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

export function LivePreview({ config, viewportWidth = null }) {
  const { branding, typography, colors, features, layout } = config;
  const fontStack = (FONT_OPTIONS.find((f) => f.value === typography.font_family) || FONT_OPTIONS[0]).stack;
  /* Container-aware breakpoints measured from the device frame itself
     (ResizeObserver), NOT the browser window - so grid columns, header
     layout and typography adapt exactly as they would on the physical
     device inside the simulated viewport. */
  const compact = viewportWidth != null && viewportWidth > 0 && viewportWidth < 480;
  const narrow = viewportWidth != null && viewportWidth >= 480 && viewportWidth < 768;
  const centered = layout.header_style === 'centered' || narrow || compact;
  const gridColumns = compact ? Math.min(layout.product_grid_columns, 2) : layout.product_grid_columns;
  const waDigits = String(features.whatsapp_number || '').replace(/\D/g, '');
  const waHref = (product) => {
    const msg = `${features.whatsapp_custom_message || 'Hello! I would like to buy'} ${product.name} (${ghs(product.price)}).`;
    return `https://wa.me/${waDigits}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <div
      className="h-full w-full overflow-y-auto overflow-x-hidden"
      style={{
        '--primary': colors.primary,
        '--bg': colors.background,
        '--text': colors.text,
        '--accent': colors.accent,
        '--radius': layout.border_radius,
        background: 'var(--bg)',
        color: 'var(--text)',
        fontFamily: fontStack,
        fontSize: `${typography.body_size}px`,
      }}
      aria-label="Live storefront preview"
    >
      {/* Header */}
      <header
        className={`flex items-center gap-3 border-b px-5 py-3.5 ${centered ? 'flex-col justify-center' : 'justify-between'}`}
        style={{ borderColor: 'rgba(148,163,184,.25)' }}
      >
        <div className={`flex items-center gap-2.5 ${centered ? 'flex-col' : ''}`}>
          {branding.logo_url ? (
            <img src={branding.logo_url} alt="" className="h-8 w-8 rounded object-contain" />
          ) : (
            <span className="rounded-lg p-1.5" style={{ background: 'var(--primary)', color: '#fff' }}>
              <IconStore size={16} />
            </span>
          )}
          <div className={centered ? 'text-center' : ''}>
            <p className="text-sm font-extrabold leading-tight" style={{ fontWeight: typography.heading_weight }}>
              {branding.site_title}
            </p>
            {branding.tagline && (
              <p className={`text-[11px] opacity-70 ${compact ? 'max-w-[180px] truncate' : ''}`}>{branding.tagline}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          aria-label="Cart"
          className={`relative rounded-lg text-xs font-bold text-white shadow transition-transform duration-200 hover:-translate-y-0.5 ${compact ? 'px-2 py-1.5' : 'px-3 py-2'}`}
          style={{ background: 'var(--primary)', borderRadius: 'var(--radius)' }}
        >
          <IconCart size={14} className="inline" /> Cart (0)
        </button>
      </header>

      {/* Hero banner (conditional) */}
      {features.enable_hero_banner && (
        <section
          className={`text-center ${compact ? 'px-4 py-7' : 'px-6 py-9'}`}
          style={{ background: 'linear-gradient(125deg, var(--primary) 0%, var(--accent) 165%)', color: '#fff' }}
        >
          <h1
            className={`${compact ? 'text-lg' : 'text-xl sm:text-2xl'} font-extrabold`}
            style={{ fontWeight: typography.heading_weight }}
          >
            {branding.site_title}
          </h1>
          <p className="mx-auto mt-1.5 max-w-md text-sm opacity-90">
            {branding.tagline || 'Shop our latest arrivals'}
          </p>
        </section>
      )}

      {/* Product grid */}
      <section className="p-5" aria-label="Sample products">
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0,1fr))` }}
        >
          {DEMO_PRODUCTS.map((p) => (
            <article
              key={p.id}
              className="overflow-hidden border border-slate-200/70 shadow-sm transition-shadow duration-300 hover:shadow-md"
              style={{ borderRadius: 'var(--radius)', background: 'var(--surface)' }}
            >
              <div className="relative aspect-[4/3] overflow-hidden">
                <img src={p.img} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                {features.enable_stock_counter && p.stock <= 5 && (
                  <span
                    className="absolute left-2 top-2 rounded-md px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide shadow"
                    style={{ background: 'var(--accent)', color: '#0F172A' }}
                  >
                    Only {p.stock} left
                  </span>
                )}
              </div>

              <div className="space-y-1.5 p-3">
                <h3 className="truncate text-sm font-bold">{p.name}</h3>
                <p className="text-sm font-extrabold" style={{ color: 'var(--primary)' }}>{ghs(p.price)}</p>

                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  <button
                    type="button"
                    className="flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-white transition-transform duration-200 hover:-translate-y-0.5"
                    style={{ background: 'var(--primary)', borderRadius: 'var(--radius)' }}
                  >
                    Buy Now
                  </button>
                  {features.enable_whatsapp_buy && (
                    <a
                      href={waDigits ? waHref(p) : undefined}
                      target="_blank"
                      rel="noreferrer"
                      aria-disabled={!waDigits}
                      title={waDigits ? 'WhatsApp Quick Buy' : 'Set a WhatsApp number first'}
                      className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-bold transition ${
                        waDigits
                          ? 'border-emerald-500 text-emerald-600 hover:bg-emerald-50'
                          : 'pointer-events-none border-slate-200 text-slate-300'
                      }`}
                      style={{ borderRadius: 'var(--radius)' }}
                    >
                      <IconWhatsApp size={12} /> Quick Buy
                    </a>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Trust + delivery badges (conditional) */}
      {features.enable_trust_badges && (
        <footer
          className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t px-4 py-4 text-[11px] font-bold"
          style={{ borderColor: 'rgba(148,163,184,.3)' }}
        >
          <span className="flex items-center gap-1.5"><IconShield size={14} style={{ color: 'var(--primary)' }} /> GH Secured</span>
          <span className="flex items-center gap-1.5"><IconTruck size={14} style={{ color: 'var(--primary)' }} /> 24-hr delivery</span>
          <span className="flex items-center gap-1.5"><IconWallet size={14} style={{ color: 'var(--primary)' }} /> MoMo accepted</span>
        </footer>
      )}
    </div>
  );
}

/**
 * Expanded preview canvas page. Hydrates from the shell's cached working
 * copy, then mirrors every `gs:theme-preview` broadcast for real-time
 * rendering while merchants edit the accordion panel.
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
            <LivePreview config={config} viewportWidth={frameSize.width} />
          </div>
        </div>
      </section>
    </div>
  );
}



