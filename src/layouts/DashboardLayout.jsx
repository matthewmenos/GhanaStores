/**
 * DashboardLayout.jsx
 * Split-pane seller shell implementing a sidebar-REPLACING customizer:
 *
 *   isCustomizerOpen === false -> dark navy (#0B1120) primary nav column,
 *                                 280px wide, hosting Analytics / POS /
 *                                 Inventory / Orders / Theme Market.
 *   isCustomizerOpen === true  -> dark nav unmounts completely and the light
 *                                 accordion control panel (380px) slides into
 *                                 the leftmost slot, granting the entire
 *                                 remaining flex-1 width to the live
 *                                 storefront preview canvas.
 *
 * Below 768px both panels become an off-canvas drawer sheet driven by the
 * sticky mobile top bar hamburger.
 *
 * STRICT RULE: pure SVG / Lucide React icons ONLY — zero emojis everywhere.
 */
import { useEffect, useState } from 'react';
import {
  IconStore, IconDashboard, IconCart, IconBox, IconReceipt,
  IconWallet, IconLogout, IconX, IconLogo,
} from '../components/icons.jsx';
import {
  Palette, Type, MessageSquare, Layout,
  ChevronLeft, Loader2, Check, Menu, ArrowLeft,
  PanelTop, PanelBottom, Package, FileText, Code2, RotateCcw,
  PanelLeftClose, Globe,
} from 'lucide-react';
import { api } from '../api.js';
import { storefrontUrl } from '../config.js';
import { navigate, usePathname } from '../router.js';
import {
  DEFAULT_CUSTOM_THEME_CONFIG, normalizeCustomThemeConfig, seedConfigFromTheme,
} from '../theme/config.js';

/* -------------------------- Sidebar nav config -------------------------- */
const DASHBOARD_NAV = [
  { path: '/dashboard',       label: 'Analytics',     icon: IconDashboard },
  { path: '/pos',             label: 'POS Terminal',  icon: IconCart },
  { path: '/payouts',         label: 'Payouts',       icon: IconWallet },
  { path: '/inventory',       label: 'Inventory',     icon: IconBox },
  { path: '/orders',          label: 'Orders',        icon: IconReceipt },
  { path: '/dashboard/themes',label: 'Theme Market',  icon: Palette },
  { path: '/domains',         label: 'Domains',       icon: Globe },
];

/** Route that flips the shell into sidebar-replacing customizer mode. */
const CUSTOMIZER_ROUTE = '/dashboard/themes/customizer';

/**
 * Shared off-canvas drawer shell: overlay sheet below 768px, static
 * sidebar column from md (768px) up. Width/background/borders are
 * supplied per panel (280px navy nav vs 380px light customizer panel).
 */
const DRAWER_POSITION =
  'fixed inset-y-0 left-0 z-50 flex h-full shrink-0 flex-col overflow-y-auto transition-transform duration-300 ease-in-out md:static md:z-0 md:h-screen md:max-w-none md:translate-x-0';

/* ----------------------------- Accordion item --------------------------- */
function Accordion({ id, icon: Icon, title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = `accordion-panel-${id}`;
  return (
    <div className="border-b border-slate-200">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        id={`accordion-toggle-${id}`}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <span className="flex min-w-0 items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-charcoal">
          {Icon && <Icon size={15} className="shrink-0 text-slate-500" />}
          <span className="truncate">{title}</span>
        </span>
        <ChevronLeft
          size={14}
          className={`transition-transform duration-200 ${open ? 'rotate-180' : 'rotate-90'}`}
          aria-hidden="true"
        />
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={`accordion-toggle-${id}`}
        className={`overflow-hidden transition-all duration-200 ${open ? 'max-h-96' : 'max-h-0'}`}
      >
        <div className="px-3 pt-1 pb-2">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------ Color picker helper -------------------------- */
function ColorRow({ label, value, onChange }) {
  return (
    <div className="space-y-1">
      <label className="flex justify-between text-xs font-medium text-slate-600">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded border border-slate-300"
          aria-label={`${label} color`}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-24 rounded border border-slate-300 px-2 py-1 text-xs font-mono"
          aria-label={`${label} hex`}
        />
      </div>
    </div>
  );
}

/* --------------------------- Toggle switch ---------------------------- */
function ToggleRow({ label, value, onChange }) {
  return (
    <label className="flex items-center justify-between">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? 'bg-blue-600' : 'bg-slate-300'}`}
      >
        <span className="sr-only">{label}</span>
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : ''}`}
        />
      </button>
    </label>
  );
}

/* --------------------------- Multiline field -------------------------- */
function TextAreaRow({ label, value, onChange, rows = 3, mono = false }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded border border-slate-300 px-2 py-1.5 leading-relaxed ${mono ? 'font-mono text-[11px]' : 'text-sm'}`}
      />
    </label>
  );
}

/* ----------------------- Shared CSS variable sync -------------------- */
function useLiveThemeVars(customTheme) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--primary', customTheme.colors.primary);
    root.style.setProperty('--bg', customTheme.colors.background);
    root.style.setProperty('--surface', customTheme.colors.surface);
    root.style.setProperty('--text', customTheme.colors.text);
    root.style.setProperty('--accent', customTheme.colors.accent);
    root.style.setProperty('--radius', customTheme.layout.border_radius);
    root.style.setProperty(
      '--font-stack',
      `'${customTheme.typography.font_family}', system-ui, sans-serif`,
    );
            root.style.fontSize = `${customTheme.typography.body_size}px`;
  }, [customTheme]);
}

/* ------------------- Mode A: main dashboard sidebar --------------- */
function MainSidebar({ open, store, onNavClose, route, onNavigate, isActive }) {
  return (
    <aside
      id="gs-sidebar"
      aria-label="Seller dashboard navigation"
      className={`${DRAWER_POSITION} h-full w-[280px] max-w-[92vw] overflow-y-auto bg-[#0B1120] text-slate-100 ${
        open ? 'translate-x-0 shadow-2xl' : '-translate-x-full invisible'
      } md:visible md:w-[280px] md:shadow-none`}
    >
      {/* Brand header */}
      <div className="-mx-2 mb-2 flex h-12 items-center justify-between">
        <div className="flex items-center gap-2.5">
          <IconLogo size={30} className="rounded-full" />
          <span className="font-bold">DiDwa</span>
        </div>
        <button
          type="button"
          onClick={onNavClose}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white md:hidden"
          aria-label="Close menu"
        >
          <IconX size={18} />
        </button>
      </div>

      {/* Theme marketplace trigger (prominent) */}
      <button
        type="button"
        onClick={() => onNavigate('/dashboard/themes')}
        className={`flex w-full items-center gap-2.5 rounded-xl px-4 py-2.5 text-left text-sm font-semibold transition ${
          isActive('/dashboard/themes')
            ? 'bg-blue-600 text-white'
            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        }`}
      >
        <Palette size={17} />
        <span>Theme Market</span>
      </button>

      {/* Primary nav */}
      <nav className="mt-1 space-y-1" aria-label="Main navigation">
        {DASHBOARD_NAV.map(({ path, label, icon: Icon }) => (
          <button
            key={path}
            type="button"
            onClick={() => onNavigate(path)}
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              isActive(path)
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Icon size={17} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* Footer: store + logout */}
      <div className="mt-auto border-t border-slate-800 p-4">
        <p className="truncate text-sm font-bold text-white">
          {store?.name || 'My Store'}
        </p>
        <a
          href={storefrontUrl(store)}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-xs text-blue-400 hover:text-blue-300"
        >
          {storefrontUrl(store).replace(/^https?:\/\//, '')}
        </a>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event('gs:logout'))}
          className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-red-600 hover:text-white"
        >
                    <IconLogout size={16} />
          Sign out
        </button>
      </div>
    </aside>
  );
}

/* ------------------- Mode B: theme customizer sidebar ------------- */
function CustomizerSidebar({
  open,
  collapsed,
  onToggleCollapse,
  customTheme, setCustomTheme, isPublishing, publishSuccess,
  onPublish, onBack, onResetDefaults,
}) {
  useLiveThemeVars(customTheme);

  const updateTokens = (path, value) =>
    setCustomTheme((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.');
      let node = next;
      for (let i = 0; i < keys.length - 1; i++) node = node[keys[i]];
      node[keys[keys.length - 1]] = value;
      return next;
    });

  const color = (path) => (hex) => updateTokens(path, hex);
  const num = (path) => (e) => updateTokens(path, Number(e.target.value));
  const str = (path) => (e) => updateTokens(path, e.target.value);
  const b = (path) => (v) => updateTokens(path, v);

  return (
    <aside
      id="gs-sidebar"
      aria-label="Theme customizer controls"
      className={`${DRAWER_POSITION} h-screen w-[380px] max-w-[92vw] border-r border-gray-200 bg-white text-slate-900 ${
        open ? 'translate-x-0 shadow-2xl' : '-translate-x-full invisible'
      } md:visible md:w-[380px] md:shadow-none ${collapsed ? 'lg:hidden' : ''}`}
    >
      {/* WordPress-style control header */}
      <header className="border-b border-gray-200 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Hide controls"
            aria-label="Hide customizer controls"
            className="hidden rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:block"
          >
            <PanelLeftClose size={16} aria-hidden="true" />
          </button>

          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">You are customizing</p>
            <p className="truncate text-base font-extrabold leading-tight text-charcoal" title={customTheme.branding.site_title}>
              {customTheme.branding.site_title}
            </p>
          </div>

          <button
            type="button"
            onClick={onPublish}
            disabled={isPublishing}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
            aria-live="polite"
          >
            {isPublishing ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : publishSuccess ? (
              <Check size={14} aria-hidden="true" />
            ) : null}
            {isPublishing ? 'Publishing' : publishSuccess ? 'Saved' : 'Publish'}
          </button>
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-w-0 items-center gap-1 rounded text-[11px] font-bold text-blue-600 transition hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <ArrowLeft size={12} aria-hidden="true" />
            <span className="truncate">Back to dashboard</span>
          </button>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-slate-400">
            <span
              className={`h-1.5 w-1.5 rounded-full ${publishSuccess ? 'bg-emerald-brand' : ''}`}
              style={publishSuccess ? undefined : { background: customTheme.colors.primary }}
              aria-hidden="true"
            />
            {publishSuccess ? 'All changes are live' : 'In sync with storefront'}
          </span>
        </div>
      </header>

      {/* Scrollable accordion body */}
      <div className="flex-1 space-y-1 overflow-y-auto border-gray-200 px-1 py-1">
        {/* Section 1: identity */}
        <Accordion id="identity" icon={Type} title="Identity & Tagline">
          <div className="space-y-2">
            <input
              type="text"
              value={customTheme.branding.site_title}
              onChange={str('branding.site_title')}
              className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm"
              placeholder="Site title"
            />
            <input
              type="text"
              value={customTheme.branding.tagline}
                                          onChange={str('branding.tagline')}
              className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm"
              placeholder="Tagline"
                        />
          </div>
        </Accordion>

        {/* Section 2: colors */}
        <Accordion id="colors" icon={Palette} title="Colors & Accents" defaultOpen>
          <div className="space-y-2">
            <ColorRow label="Primary" value={customTheme.colors.primary} onChange={color('colors.primary')} />
            <ColorRow label="Background" value={customTheme.colors.background} onChange={color('colors.background')} />
            <ColorRow label="Surface Card" value={customTheme.colors.surface} onChange={color('colors.surface')} />
            <ColorRow label="Text" value={customTheme.colors.text} onChange={color('colors.text')} />
            <ColorRow label="Highlight" value={customTheme.colors.accent} onChange={color('colors.accent')} />
          </div>
        </Accordion>

        {/* Section 3: WhatsApp commerce */}
        <Accordion id="whatsapp" icon={MessageSquare} title="WhatsApp & Integrations">
          <div className="space-y-2">
            <ToggleRow
              label="Direct WhatsApp Purchasing"
              value={customTheme.features.enable_whatsapp_buy}
              onChange={b('features.enable_whatsapp_buy')}
            />
            {customTheme.features.enable_whatsapp_buy && (
              <div className="ml-4 space-y-2 border-l border-slate-100 pl-2">
                <input
                  type="tel"
                  value={customTheme.features.whatsapp_number}
                  onChange={str('features.whatsapp_number')}
                  placeholder="233201234567"
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm"
                />
                <input
                  type="text"
                  value={customTheme.features.whatsapp_custom_message}
                  onChange={str('features.whatsapp_custom_message')}
                  placeholder="Custom checkout message"
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm"
                />
              </div>
            )}
            <ToggleRow label="Hero Banner" value={customTheme.features.enable_hero_banner} onChange={b('features.enable_hero_banner')} />
            <ToggleRow label="Trust Badges" value={customTheme.features.enable_trust_badges} onChange={b('features.enable_trust_badges')} />
            <ToggleRow label="Stock Counter" value={customTheme.features.enable_stock_counter} onChange={b('features.enable_stock_counter')} />
          </div>
        </Accordion>

        {/* Layout & Typography */}
        <Accordion id="layout" icon={Layout} title="Layout & Typography">
          <div className="space-y-2">
            <select
              value={customTheme.typography.font_family}
              onChange={str('typography.font_family')}
              className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm"
            >
              <option value="Inter">Inter</option>
              <option value="Poppins">Poppins</option>
 <option value="Outfit">Outfit</option>
 <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
            </select>
            <select
              value={customTheme.layout.border_radius}
              onChange={str('layout.border_radius')}
              className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm"
            >
              <option value="0rem">Crisp (0rem)</option>
              <option value="0.375rem">Subtle (0.375rem)</option>
              <option value="0.75rem">Rounded (0.75rem)</option>
              <option value="1.5rem">Extra Rounded (1.5rem)</option>
            </select>
            <select
              value={customTheme.layout.product_grid_columns}
              onChange={num('layout.product_grid_columns')}
              className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm"
            >
              <option value={2}>2 columns</option>
              <option value={3}>3 columns</option>
              <option value={4}>4 columns</option>
            </select>
            <select
              value={customTheme.layout.header_style}
              onChange={str('layout.header_style')}
              className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm"
            >
              <option value="left_aligned">Left aligned</option>
              <option value="centered">Centered</option>
            </select>
          </div>
        </Accordion>

        {/* Section 5: header & navigation */}
        <Accordion id="header" icon={PanelTop} title="Header & Navigation">
          <div className="space-y-2">
            <ToggleRow label="Sticky header" value={customTheme.header.sticky} onChange={b('header.sticky')} />
            <ToggleRow label="Show search icon" value={customTheme.header.show_search} onChange={b('header.show_search')} />
            <ToggleRow label="Announcement bar" value={customTheme.header.announcement_enabled} onChange={b('header.announcement_enabled')} />
            {customTheme.header.announcement_enabled && (
              <input
                type="text"
                value={customTheme.header.announcement_text}
                onChange={str('header.announcement_text')}
                placeholder="Announcement message"
                className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm"
              />
            )}
          </div>
        </Accordion>

        {/* Section 6: footer & social */}
        <Accordion id="footer" icon={PanelBottom} title="Footer & Social">
          <div className="space-y-2">
            <select
              value={customTheme.footer.columns}
              onChange={num('footer.columns')}
              className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm"
              aria-label="Footer columns"
            >
              <option value={1}>1 column</option>
              <option value={2}>2 columns</option>
              <option value={3}>3 columns</option>
              <option value={4}>4 columns</option>
            </select>
            <input
              type="text"
              value={customTheme.footer.copyright}
              onChange={str('footer.copyright')}
              placeholder="Copyright line"
              className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm"
            />
            <TextAreaRow label="Footer blurb" value={customTheme.footer.blurb} onChange={str('footer.blurb')} rows={2} />
            <ToggleRow label="Show payment badges" value={customTheme.footer.show_payments} onChange={b('footer.show_payments')} />
            <ToggleRow label="Show social icons" value={customTheme.footer.show_social} onChange={b('footer.show_social')} />
            {customTheme.footer.show_social && (
              <div className="space-y-2 rounded-lg bg-slate-50 p-2.5">
                <ToggleRow label="Instagram" value={customTheme.social.instagram} onChange={b('social.instagram')} />
                <ToggleRow label="Facebook" value={customTheme.social.facebook} onChange={b('social.facebook')} />
                <ToggleRow label="TikTok" value={customTheme.social.tiktok} onChange={b('social.tiktok')} />
              </div>
            )}
          </div>
        </Accordion>

        {/* Section 7: product page */}
        <Accordion id="product-page" icon={Package} title="Product Page">
          <div className="space-y-2">
            <ToggleRow label="Breadcrumbs" value={customTheme.product_page.breadcrumbs} onChange={b('product_page.breadcrumbs')} />
            <ToggleRow label="Quantity stepper" value={customTheme.product_page.quantity_stepper} onChange={b('product_page.quantity_stepper')} />
            <ToggleRow label="Customer reviews" value={customTheme.product_page.reviews} onChange={b('product_page.reviews')} />
            <ToggleRow label="Related products" value={customTheme.product_page.related_products} onChange={b('product_page.related_products')} />
          </div>
        </Accordion>

        {/* Section 8: page content */}
        <Accordion id="page-content" icon={FileText} title="Page Content">
          <div className="space-y-2">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">About Us page</p>
            <input
              type="text"
              value={customTheme.pages_content.about_title}
              onChange={str('pages_content.about_title')}
              placeholder="About page heading"
              className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm"
            />
            <TextAreaRow label="About story" value={customTheme.pages_content.about_body} onChange={str('pages_content.about_body')} rows={4} />
            <p className="pt-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Contact page</p>
            <input
              type="email"
              value={customTheme.pages_content.contact_email}
              onChange={str('pages_content.contact_email')}
              placeholder="Contact email"
              className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm"
            />
            <input
              type="tel"
              value={customTheme.pages_content.contact_phone}
              onChange={str('pages_content.contact_phone')}
              placeholder="Contact phone"
              className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm"
            />
            <input
              type="text"
              value={customTheme.pages_content.contact_address}
              onChange={str('pages_content.contact_address')}
              placeholder="Store address"
              className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </div>
        </Accordion>

        {/* Section 9: advanced */}
        <Accordion id="advanced" icon={Code2} title="Advanced">
          <div className="space-y-2">
            <TextAreaRow
              label="Additional CSS (scoped to the storefront preview)"
              value={customTheme.advanced.custom_css}
              onChange={str('advanced.custom_css')}
              rows={5}
              mono
            />
            <p className="text-[10px] leading-relaxed text-slate-400">
              {'Example: .product-card { border: 2px dashed teal; } - rules are namespaced under the preview root, so the dashboard stays untouched.'}
            </p>
            <button
              type="button"
              onClick={onResetDefaults}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <RotateCcw size={13} aria-hidden="true" />
              Reset all styling to defaults
            </button>
          </div>
        </Accordion>
      </div>
    </aside>
  );
}

export default function DashboardLayout({ children }) {
  const [isCustomizerOpen, setIsCustomizerOpen] = useState(
    window.location.pathname === CUSTOMIZER_ROUTE,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  /* WordPress-style collapse of the customizer control rail (lg+ only). */
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const route = usePathname();
  const [store, setStore] = useState(null);

  const [customTheme, setCustomTheme] = useState(() => {
    try {
      const cached = localStorage.getItem('gs_custom_theme');
      return cached ? normalizeCustomThemeConfig(JSON.parse(cached)) : DEFAULT_CUSTOM_THEME_CONFIG;
    } catch {
      return DEFAULT_CUSTOM_THEME_CONFIG;
    }
  });
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);

  /* '/dashboard' matches exactly only - theme sub-routes belong to
     Theme Market, not Analytics. */
  const isActive = (path) =>
    route === path ||
    (path !== '/' && path !== '/dashboard' && route.startsWith(`${path}/`));

  useEffect(() => {
    const onChange = () => setIsCustomizerOpen(window.location.pathname === CUSTOMIZER_ROUTE);
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
  }, []);

  useEffect(() => {
    const handleLogout = () => setStore(null);
    window.addEventListener('gs:logout', handleLogout);
    return () => window.removeEventListener('gs:logout', handleLogout);
  }, []);

  /* Persist the working copy so the preview page can hydrate instantly. */
  useEffect(() => {
    localStorage.setItem('gs_custom_theme', JSON.stringify(customTheme));
  }, [customTheme]);

  /* Broadcast every edit so the live storefront preview canvas re-renders
     in real time without prop drilling through the hash router. */
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('gs:theme-preview', { detail: customTheme }));
  }, [customTheme]);

  /* First visit with an empty cache: seed from the currently published theme. */
  useEffect(() => {
    if (localStorage.getItem('gs_custom_theme')) return;
    let alive = true;
    api.get('/api/store/theme')
      .then((res) => {
        if (!alive || !res?.theme?.config) return;
        const seeded = normalizeCustomThemeConfig(seedConfigFromTheme(res.theme.config));
        setCustomTheme(seeded);
        localStorage.setItem('gs_custom_theme', JSON.stringify(seeded));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  /* Escape dismisses the mobile drawer sheet (<768px only). */
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  /* When the marketplace / demo viewer asks to customize the ACTIVE theme,
     pre-seed the working copy from that theme's config before opening the
     rail (requirement: customizer opens the active theme, not defaults). */
  useEffect(() => {
    const onOpenCustomizer = (e) => {
      if (e?.detail) {
        const seeded = normalizeCustomThemeConfig(e.detail);
        setCustomTheme(seeded);
        localStorage.setItem('gs_custom_theme', JSON.stringify(seeded));
      }
      setDrawerOpen(false);
      setIsCustomizerOpen(true);
    };
    window.addEventListener('gs:open-customizer', onOpenCustomizer);
    return () => window.removeEventListener('gs:open-customizer', onOpenCustomizer);
  }, []);

  /* WordPress-style collapse: the preview canvas edge handle and the rail
     chevron both toggle this - hides the control column on lg+ screens so
     the storefront preview takes the full width. */
  useEffect(() => {
    const onToggle = () => setPanelCollapsed((v) => !v);
    window.addEventListener('gs:customizer-collapse', onToggle);
    return () => window.removeEventListener('gs:customizer-collapse', onToggle);
  }, []);

  const onNavigate = (path) => {
    navigate(path);
    setIsCustomizerOpen(path === CUSTOMIZER_ROUTE);
    setDrawerOpen(false);
  };

  const onBack = () => {
    // Same primitive as sidebar links: leaves customizer mode (the target
    // hash is not CUSTOMIZER_ROUTE), closes the drawer and restores the
    // dark primary nav sidebar.
    onNavigate('/dashboard/themes');
  };

  /* Advanced > Reset: restore every token to schema defaults. */
  const onResetDefaults = () => {
    setCustomTheme(normalizeCustomThemeConfig(null));
  };

  const onPublish = async () => {
    setIsPublishing(true);
    setPublishSuccess(false);
    try {
      await api.put('/api/store/theme', { custom_theme_config: customTheme });
      setPublishSuccess(true);
      setTimeout(() => setPublishSuccess(false), 2000);
    } catch (e) {
      console.error('Failed to publish theme:', e);
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Off-canvas scrim - tap to dismiss the drawer sheet (<768px) */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close navigation menu"
        onClick={() => setDrawerOpen(false)}
        className={`fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
          drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {!isCustomizerOpen ? (
        <MainSidebar
          open={drawerOpen}
          store={store}
          onNavClose={() => setDrawerOpen(false)}
          route={route}
          onNavigate={onNavigate}
          isActive={isActive}
        />
      ) : (
        <CustomizerSidebar
          open={drawerOpen}
          collapsed={panelCollapsed}
          onToggleCollapse={() => setPanelCollapsed((v) => !v)}
          customTheme={customTheme}
          setCustomTheme={setCustomTheme}
          isPublishing={isPublishing}
          publishSuccess={publishSuccess}
          onPublish={onPublish}
          onBack={onBack}
          onResetDefaults={onResetDefaults}
        />
      )}

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {/* Sticky mobile top bar (<768px): hamburger opens the drawer */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-slate-700/60 bg-slate-900 px-2 py-2 text-white shadow-lg md:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            aria-controls="gs-sidebar"
            className="rounded-lg p-2 text-slate-200 transition hover:bg-slate-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Menu size={20} />
          </button>
          <span className="flex items-center gap-2 text-sm font-bold">
            <IconStore size={18} className="text-blue-400" />
            DiDwa
          </span>
          {isCustomizerOpen && (
            <button
              type="button"
              onClick={onPublish}
              disabled={isPublishing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-60"
              aria-live="polite"
            >
              {isPublishing ? (
                <Loader2 size={13} className="animate-spin" />
              ) : publishSuccess ? (
                <Check size={13} />
              ) : null}
              {isPublishing ? 'Saving' : publishSuccess ? 'Saved' : 'Publish'}
            </button>
          )}
        </header>
        {children}
      </main>
    </div>
  );
}
