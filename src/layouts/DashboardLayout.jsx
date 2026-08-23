/**
 * DashboardLayout.jsx
 * Split-pane seller shell: fixed 320px contextual sidebar that hosts
 * Mode A (standard dashboard navigation) OR Mode B (theme-customizer
 * sub-sidebar), driven by a single `sidebarMode` state.
 *
 * Switch is instantaneous and in-place — primary nav content swaps
 * to customizer controls so the main canvas keeps its full width with
 * no horizontal squeeze or double scrollbars.
 *
 * STRICT RULE: pure SVG / Lucide React icons ONLY — zero emojis everywhere.
 */
import { useEffect, useState } from 'react';
import {
  IconStore, IconDashboard, IconCart, IconBox, IconReceipt,
  IconWallet, IconLogout,
} from '../components/icons.jsx';
import {
  Palette, Type, MessageSquare, Layout,
  ChevronLeft, Loader2, Check,
} from 'lucide-react';
import { api } from '../api.js';

/* ----------------------- Default token schema ----------------------- */
const DEFAULT_CUSTOM_THEME_CONFIG = {
  branding: { site_title: 'My Ghana Store', tagline: 'Quality goods, delivered nationwide', logo_url: '', favicon_url: '' },
  typography: { font_family: 'Inter', heading_weight: '700', body_size: 16 },
  colors: { primary: '#0B6E4F', background: '#FFFFFF', surface: '#F8FAFC', text: '#0F172A', accent: '#F59E0B' },
  features: { enable_whatsapp_buy: true, whatsapp_number: '233201234567', whatsapp_custom_message: 'Hello! I would like to buy', enable_trust_badges: true, enable_hero_banner: true, enable_stock_counter: false },
  layout: { border_radius: '0.75rem', product_grid_columns: 3, header_style: 'left_aligned' },
};

/* -------------------------- Sidebar nav config -------------------------- */
const DASHBOARD_NAV = [
  { hash: '#/',        label: 'Analytics',     icon: IconDashboard },
  { hash: '#/pos',      label: 'POS Terminal', icon: IconCart },
  { hash: '#/payouts',  label: 'Payouts',     icon: IconWallet },
  { hash: '#/inventory',label: 'Inventory',   icon: IconBox },
  { hash: '#/orders',   label: 'Orders',      icon: IconReceipt },
];

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
        <span className="flex items-center gap-2">
          {Icon && <Icon size={16} />}
          {title}
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
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          value ? 'bg-blue-600' : 'bg-slate-300'
        }`}
      >
        <span className="sr-only">{label}</span>
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-4' : ''
          }`}
        />
      </button>
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
function MainSidebar({ store, onNavClose, route, onNavigate, isActive }) {
  return (
    <aside className="flex h-full w-80 flex-col overflow-y-auto bg-slate-900 text-slate-100">
      {/* Brand header */}
      <div className="-mx-2 mb-2 flex h-12 items-center justify-between">
        <div className="flex items-center gap-2.5">
          <IconStore size={22} className="text-blue-400" />
          <span className="font-bold">Ghana Stores</span>
        </div>
        <button
          type="button"
          onClick={onNavClose}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
          aria-label="Close menu"
        >
          <IconX size={18} />
        </button>
      </div>

      {/* Theme marketplace trigger (prominent) */}
      <button
        type="button"
        onClick={() => onNavigate('#/dashboard/themes')}
        className={`flex w-full items-center gap-2.5 rounded-xl px-4 py-2.5 text-left text-sm font-semibold transition ${
          isActive('#/dashboard/themes')
            ? 'bg-blue-600 text-white'
            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        }`}
      >
        <Palette size={17} />
        <span>Theme Market</span>
      </button>

      {/* Primary nav */}
      <nav className="mt-1 space-y-1" aria-label="Main navigation">
        {DASHBOARD_NAV.map(({ hash, label, icon: Icon }) => (
          <button
            key={hash}
            type="button"
            onClick={() => onNavigate(hash)}
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              isActive(hash)
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
          href={`https://${store?.subdomain_slug || 'shop'}.ghastores.com`}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-xs text-blue-400 hover:text-blue-300"
        >
          {store?.subdomain_slug || 'shop'}.ghastores.com
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
  customTheme, setCustomTheme, isPublishing, publishSuccess,
  onPublish, onBack,
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
    <>
      {/* Sub-header */}
      <div className="flex items-center justify-between border-b border-slate-200 p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Back"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
            Customizer
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: customTheme.colors.primary }}
              aria-hidden="true"
            />
          </span>
        </div>
        <button
          type="button"
          onClick={onPublish}
          disabled={isPublishing}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
          aria-live="polite"
        >
          {isPublishing ? <Loader2 size={15} className="animate-spin" /> : publishSuccess ? <Check size={15} /> : null}
          {isPublishing ? 'Publishing...' : publishSuccess ? 'Published' : 'Publish'}
        </button>
      </div>

      {/* Scrollable accordion body */}
      <div className="flex-1 space-y-1 overflow-y-auto px-1 py-1">
        {/* Identity */}
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

        {/* Colors */}
        <Accordion id="colors" icon={Palette} title="Colors & Accents" defaultOpen>
          <div className="space-y-2">
            <ColorRow label="Primary" value={customTheme.colors.primary} onChange={color('colors.primary')} />
            <ColorRow label="Background" value={customTheme.colors.background} onChange={color('colors.background')} />
            <ColorRow label="Surface" value={customTheme.colors.surface} onChange={color('colors.surface')} />
            <ColorRow label="Text" value={customTheme.colors.text} onChange={color('colors.text')} />
            <ColorRow label="Accent" value={customTheme.colors.accent} onChange={color('colors.accent')} />
          </div>
        </Accordion>

        {/* WhatsApp Commerce */}
        <Accordion id="whatsapp" icon={MessageSquare} title="WhatsApp Commerce">
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
            <ToggleRow
              label="Stock Counter"
              value={customTheme.features.enable_stock_counter}
              onChange={b('features.enable_stock_counter')}
            />
          </div>
        </Accordion>
      </div>

      {/* Sub-sidebar footer */}
      <div className="flex items-center gap-2 border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: customTheme.colors.primary }}
          aria-hidden="true"
        />
        <span>Live Storefront Synchronization Active</span>
      </div>
    </>
  );
}
export default function DashboardLayout({ children }) {
  const [sidebarMode, setSidebarMode] = useState('main');
  const [route, setRoute] = useState(window.location.hash || '#/');
  const [store, setStore] = useState(null);

  const [customTheme, setCustomTheme] = useState(() => {
    const cached = localStorage.getItem('gs_custom_theme');
    return cached ? JSON.parse(cached) : DEFAULT_CUSTOM_THEME_CONFIG;
  });
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);

  const isActive = (hash) => route === hash || (hash !== '#/' && route.startsWith(`${hash}/`));

  useEffect(() => {
    const onChange = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  // Keep sidebar context in sync with the URL (deep links, back button).
  useEffect(() => {
    setSidebarMode(
      route.startsWith('#/dashboard/themes/customizer') ? 'customizer' : 'main',
    );
  }, [route]);

  useEffect(() => {
    const handleLogout = () => setStore(null);
    window.addEventListener('gs:logout', handleLogout);
    return () => window.removeEventListener('gs:logout', handleLogout);
  }, []);

  useEffect(() => {
    localStorage.setItem('gs_custom_theme', JSON.stringify(customTheme));
  }, [customTheme]);

  const onNavigate = (hash) => {
    setRoute(hash);
    window.location.hash = hash;
  };

  const onBack = () => {
    setSidebarMode('main');
    setRoute('#/dashboard/themes');
    window.location.hash = '#/dashboard/themes';
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
      {sidebarMode === 'customizer' ? (
        <CustomizerSidebar
          customTheme={customTheme}
          setCustomTheme={setCustomTheme}
          isPublishing={isPublishing}
          publishSuccess={publishSuccess}
          onPublish={onPublish}
          onBack={onBack}
        />
      ) : (
        <MainSidebar
          store={store}
          onNavClose={() => {}}
          route={route}
          onNavigate={onNavigate}
          isActive={isActive}
        />
      )}
      <main className="flex flex-1 flex-col overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
