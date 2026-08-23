/**
 * ThemeCustomizer - split-screen WordPress-style live theme editor.
 * Left: accordion control panel (~400px). Right: reactive sandbox canvas.
 * Persists the complete extended token schema via PUT /api/store/theme
 * as `custom_theme_config`.
 *
 * STRICT RULE: pure SVG / Lucide React icons ONLY - ZERO emojis.
 */
import { useEffect, useMemo, useState } from 'react';
import { api, ghs } from '../api.js';
import {
  IconStore, IconAlert, IconWhatsApp, IconCart,
  IconShield, IconTruck, IconWallet,
} from '../components/icons.jsx';
import {
  ArrowLeft, ChevronDown, Loader2, Check, Palette, Type,
  MessageCircle, Eye,
} from 'lucide-react';

/* ----------------------------- Token vocabulary ---------------------------- */
const FONT_OPTIONS = [
  { value: 'Inter', label: 'Inter', stack: "'Inter', system-ui, -apple-system, sans-serif" },
  { value: 'Poppins', label: 'Poppins', stack: "'Poppins', system-ui, sans-serif" },
  { value: 'Outfit', label: 'Outfit', stack: "'Outfit', system-ui, sans-serif" },
  { value: 'Plus Jakarta Sans', label: 'Plus Jakarta Sans', stack: "'Plus Jakarta Sans', system-ui, sans-serif" },
];

const RADIUS_OPTIONS = [
  { value: '0rem', label: 'Crisp - 0rem' },
  { value: '0.375rem', label: 'Subtle - 0.375rem' },
  { value: '0.75rem', label: 'Rounded - 0.75rem' },
  { value: '1.5rem', label: 'Extra Rounded - 1.5rem' },
];

const GRID_COLUMN_OPTIONS = [2, 3, 4];

const HEADER_STYLE_OPTIONS = [
  { value: 'left_aligned', label: 'Left aligned' },
  { value: 'centered', label: 'Centered' },
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
/* ------------------------------ Form primitives ---------------------------- */
function TextField({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-charcoal outline-none transition focus:ring-2 focus:ring-blue-500/40"
      />
    </label>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1">
      <span className="text-xs font-semibold text-charcoal">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-[11px] uppercase text-slate-500">{String(value).toUpperCase()}</span>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} color picker`}
          className="h-7 w-9 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
        />
      </span>
    </label>
  );
}

function SelectField({ label, value, options, onChange }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-slate-200 bg-mist px-3 py-2 text-sm font-medium text-charcoal outline-none transition focus:ring-2 focus:ring-blue-500/40"
      >
        {options.map((o) => {
          const val = typeof o === 'object' ? o.value : o;
          const lab = typeof o === 'object' ? o.label : String(o);
          return <option key={val} value={val}>{lab}</option>;
        })}
      </select>
    </label>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group flex w-full items-center justify-between gap-3 rounded-lg py-1.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <span className="text-xs font-semibold text-charcoal group-hover:text-blue-700">{label}</span>
      <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-300 ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}>
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-300 ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </span>
    </button>
  );
}

/** Smooth collapsible control group. */
function AccordionSection({ icon: Icon, title, open, onToggle, children }) {
  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left transition hover:bg-mist/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
      >
        <span className="rounded-lg bg-blue-50 p-1.5 text-blue-600"><Icon size={14} /></span>
        <span className="flex-1 text-xs font-extrabold uppercase tracking-wide text-charcoal">{title}</span>
        <ChevronDown size={15} className={`text-slate-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`grid transition-all duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="space-y-2.5 px-4 pb-4">{children}</div>
        </div>
      </div>
    </div>
  );
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

/** Split-screen theme customizer: controls left, live sandbox right. */
export default function ThemeCustomizer() {
  const [config, setConfig] = useState(DEFAULT_CUSTOM_THEME_CONFIG);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState(false);
  const [toast, setToast] = useState(null);
  const [baseline, setBaseline] = useState('');
  const [openSections, setOpenSections] = useState({
    identity: true,
    colors: true,
    whatsapp: false,
    layout: false,
  });

  // Seed the editor from the store's currently published (merged) theme.
  useEffect(() => {
    api
      .get('/api/store/theme')
      .then((res) => {
        const seeded = res.theme?.config ? seedConfigFromTheme(res.theme.config) : DEFAULT_CUSTOM_THEME_CONFIG;
        setConfig(seeded);
        setBaseline(JSON.stringify(seeded));
      })
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const patch = (section, field) => (value) =>
    setConfig((prev) => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }));

  const toggleSection = (key) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const isDirty = baseline === '' ? false : JSON.stringify(config) !== baseline;

  async function publish() {
    if (saving) return;
    setSaving(true);
    setToast(null);
    try {
      await api.put('/api/store/theme', { custom_theme_config: config });
      setPublished(true);
      setBaseline(JSON.stringify(config));
      setToast({ ok: true, msg: 'Custom theme published to your storefront.' });
    } catch (e) {
      setToast({ ok: false, msg: e.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-[560px] gap-4">
      {/* LEFT - control panel (~400px fixed) */}
      <aside className="flex w-[400px] shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <button
            type="button"
            onClick={() => { window.location.hash = '#/dashboard/themes'; }}
            aria-label="Back to theme market"
            className="rounded-lg bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <ArrowLeft size={15} />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-xs font-extrabold uppercase tracking-wide text-charcoal">Theme Customizer</p>
            <p className="text-[10px] font-medium text-slate-400">
              {isDirty ? 'Unsaved changes' : published ? 'All changes live' : 'In sync with storefront'}
            </p>
          </div>
          <button
            type="button"
            onClick={publish}
            disabled={saving || loading}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-extrabold text-white shadow-md transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
              published && !isDirty ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {saving ? (
              <><Loader2 size={14} className="animate-spin" /> Saving...</>
            ) : published && !isDirty ? (
              <><Check size={14} /> Published</>
            ) : (
              <>Publish Changes</>
            )}
          </button>
        </div>

        {/* Accordion panel */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-40 items-center justify-center gap-2 text-slate-400">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm font-medium">Loading your theme...</span>
            </div>
          ) : loadError ? (
            <div className="m-4 flex items-start gap-2 rounded-xl bg-red-50 p-4 text-sm font-medium text-red-700" role="alert">
              <IconAlert size={16} className="mt-0.5 shrink-0" /> {loadError}
            </div>
          ) : (
            <>
              <AccordionSection
                icon={IconStore}
                title="Identity & Tagline"
                open={openSections.identity}
                onToggle={() => toggleSection('identity')}
              >
                <TextField label="Site Title" value={config.branding.site_title}
                  onChange={patch('branding', 'site_title')} placeholder="My Ghana Store" />
                <TextField label="Subtitle / Tagline" value={config.branding.tagline}
                  onChange={patch('branding', 'tagline')} placeholder="Quality goods, delivered nationwide" />
              </AccordionSection>

              <AccordionSection
                icon={Palette}
                title="Colors & Accents"
                open={openSections.colors}
                onToggle={() => toggleSection('colors')}
              >
                <ColorField label="Primary Accent" value={config.colors.primary} onChange={patch('colors', 'primary')} />
                <ColorField label="Background" value={config.colors.background} onChange={patch('colors', 'background')} />
                <ColorField label="Surface Card" value={config.colors.surface} onChange={patch('colors', 'surface')} />
                <ColorField label="Text" value={config.colors.text} onChange={patch('colors', 'text')} />
                <ColorField label="Highlight / Accent" value={config.colors.accent} onChange={patch('colors', 'accent')} />
              </AccordionSection>

              <AccordionSection
                icon={MessageCircle}
                title="WhatsApp & Integrations"
                open={openSections.whatsapp}
                onToggle={() => toggleSection('whatsapp')}
              >
                <Toggle
                  label="Direct WhatsApp Purchasing"
                  checked={config.features.enable_whatsapp_buy}
                  onChange={patch('features', 'enable_whatsapp_buy')}
                />
                {config.features.enable_whatsapp_buy && (
                  <div className="space-y-2.5 border-l-2 border-blue-100 pl-3">
                    <TextField
                      label="WhatsApp Number"
                      type="tel"
                      value={config.features.whatsapp_number}
                      onChange={patch('features', 'whatsapp_number')}
                      placeholder="233201234567"
                    />
                    <TextField
                      label="Default Checkout Message"
                      value={config.features.whatsapp_custom_message}
                      onChange={patch('features', 'whatsapp_custom_message')}
                      placeholder="Hello! I would like to buy"
                    />
                  </div>
                )}
                <div className="pt-1">
                  <Toggle
                    label="Hero Banner"
                    checked={config.features.enable_hero_banner}
                    onChange={patch('features', 'enable_hero_banner')}
                  />
                  <Toggle
                    label="Trust Badges Bar"
                    checked={config.features.enable_trust_badges}
                    onChange={patch('features', 'enable_trust_badges')}
                  />
                  <Toggle
                    label="Stock Counter on Cards"
                    checked={config.features.enable_stock_counter}
                    onChange={patch('features', 'enable_stock_counter')}
                  />
                </div>
              </AccordionSection>

              <AccordionSection
                icon={Type}
                title="Layout & Typography"
                open={openSections.layout}
                onToggle={() => toggleSection('layout')}
              >
                <SelectField
                  label="Font Family"
                  value={config.typography.font_family}
                  options={FONT_OPTIONS.map((f) => ({ value: f.value, label: f.label }))}
                  onChange={patch('typography', 'font_family')}
                />
                <SelectField
                  label="Corner Border Radius"
                  value={config.layout.border_radius}
                  options={RADIUS_OPTIONS}
                  onChange={patch('layout', 'border_radius')}
                />
                <SelectField
                  label="Product Grid Columns"
                  value={String(config.layout.product_grid_columns)}
                  options={GRID_COLUMN_OPTIONS.map((n) => ({ value: String(n), label: `${n} columns` }))}
                  onChange={(v) => patch('layout', 'product_grid_columns')(Number(v))}
                />
                <SelectField
                  label="Header Style"
                  value={config.layout.header_style}
                  options={HEADER_STYLE_OPTIONS}
                  onChange={patch('layout', 'header_style')}
                />
              </AccordionSection>
            </>
          )}
        </div>
      </aside>

      {/* RIGHT - reactive live preview canvas */}
      <section className="relative flex-1 overflow-hidden rounded-2xl border border-slate-300/70 bg-slate-300/40 p-4">
        <span className="absolute right-6 top-6 z-10 inline-flex items-center gap-1.5 rounded-full bg-slate-900/80 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
          <Eye size={11} /> Live Preview
        </span>
        <LivePreview config={config} />
      </section>
    </div>
  );
}
function LivePreview({ config }) {
  const { branding, typography, colors, features, layout } = config;
  const fontStack = (FONT_OPTIONS.find((f) => f.value === typography.font_family) || FONT_OPTIONS[0]).stack;
  const centered = layout.header_style === 'centered';
  const waDigits = String(features.whatsapp_number || '').replace(/\D/g, '');
  const waHref = (product) => {
    const msg = `${features.whatsapp_custom_message || 'Hello! I would like to buy'} ${product.name} (${ghs(product.price)}).`;
    return `https://wa.me/${waDigits}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <div
      className="mx-auto h-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-300/70 shadow-2xl"
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
            {branding.tagline && <p className="text-[11px] opacity-70">{branding.tagline}</p>}
          </div>
        </div>
        <button
          type="button"
          aria-label="Cart"
          className="relative rounded-lg px-3 py-2 text-xs font-bold text-white shadow transition-transform duration-200 hover:-translate-y-0.5"
          style={{ background: 'var(--primary)', borderRadius: 'var(--radius)' }}
        >
          <IconCart size={14} className="inline" /> Cart (0)
        </button>
      </header>
      {/* Hero banner (conditional) */}
      {features.enable_hero_banner && (
        <section
          className="px-6 py-9 text-center"
          style={{ background: 'linear-gradient(125deg, var(--primary) 0%, var(--accent) 165%)', color: '#fff' }}
        >
          <h1 className="text-xl font-extrabold sm:text-2xl" style={{ fontWeight: typography.heading_weight }}>
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
          style={{ gridTemplateColumns: `repeat(${layout.product_grid_columns}, minmax(0,1fr))` }}
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