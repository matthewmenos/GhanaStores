/**
 * SellerThemeSelector - choose + preview an active storefront theme.
 * STRICT RULE: pure SVG / Lucide icons only, ZERO emojis.
 */
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { IconSearch, IconCheck, IconAlert, IconStore } from '../components/icons.jsx';
import {
  Eye, Filter, Monitor, Smartphone, LayoutGrid,
} from 'lucide-react';

const CATEGORY_LABELS = {
  fashion: 'Fashion & Apparel',
  electronics: 'Electronics & Gadgets',
  beauty: 'Beauty & Cosmetics',
  marketplace: 'General Marketplace',
  groceries: 'Groceries & Supermarket',
};

const CATEGORIES = Object.keys(CATEGORY_LABELS);

/** Shallow-deep merge: nested objects merge recursively; scalars override. */
function mergeTheme(base, override) {
  if (base == null || typeof base !== 'object') return override;
  if (override == null || typeof override !== 'object') return override;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(override || {})) {
    out[k] = mergeTheme(base[k], override[k]);
  }
  return out;
}

/** Perceived luminance 0..1 of a hex color - drives light/dark text contrast. */
function paletteLuminance(hex) {
  const h = (hex || '#0B1120').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function cardStyleClasses(style) {
  const map = {
    bordered: 'border border-slate-200 bg-white',
    minimal:  'border border-slate-100 bg-white/90',
    compact:  'bg-white/80',
  };
  return `${map[style] || map.minimal} theme-card`;
}
/**
 * Live sandbox preview of a storefront rendered from a theme config.
 * Desktop/Mobile viewport toggles the device shell width.
 */
function ThemePreview({ theme, viewport }) {
  const c = (theme && theme.config) || {};
  const pal = c.palette || {};
  const layout = c.layout || {};
  const br = c.borderRadius || {};
  const hero = c.hero || {};
  const conv = c.conversion || {};
  const isMobile = viewport === 'mobile';
  const cols = layout.gridColumns || 3;
  const radius = br.base || '0.5rem';
  const headerIsDark = (pal.background || '#fff') !== '#FFFFFF';

  const products = useMemo(
    () =>
      Array.from({ length: 6 }).map((_, i) => ({
        id: i,
        name: `${CATEGORY_LABELS[theme.category] || 'Product'} ${i + 1}`,
        price: `₵${(99 + i * 30).toFixed(2)}`,
        img: `https://picsum.photos/seed/p${i}/40/40`,
      })),
    [theme.category],
  );

  return (
    <div className="flex justify-center">
      <div className="relative mx-auto bg-slate-100/40 p-2" style={{ width: isMobile ? 360 : 560 }}>
        <div
          className="relative h-full w-full overflow-hidden bg-white"
          style={{ borderRadius: isMobile ? 32 : 18 }}
        >
          {/* Header */}
          <header
            className="flex h-12 items-center justify-between px-3"
            style={{
              background: pal.primary,
              color: headerIsDark ? '#fff' : '#0B1120',
            }}
          >
            <span className="flex items-center gap-1.5 font-bold">{theme?.name || 'Theme'}</span>
            <IconStore size={18} />
          </header>

          {/* Hero banner */}
          {layout.heroBanner && (
            <div
              className="relative flex h-40 flex-col items-center justify-center gap-1 px-4 text-center"
              style={{
                background: `${pal.accent}18, ${pal.background}`,
                color: headerIsDark ? '#0B1120' : '#1F2937',
              }}
            >
              <div className="text-xs font-semibold opacity-80">{hero.subtitle}</div>
              <div className="text-lg font-extrabold">{hero.title}</div>
              <div className="text-xs font-bold" style={{ color: pal.accent }}>
                {conv.ctaText || 'Shop now'}
              </div>
            </div>
          )}

          {/* Product grid */}
          <div className="p-3">
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, borderRadius: radius }}
            >
              {products.map((p) => (
                <div
                  key={p.id}
                  className={cardStyleClasses(layout.cardStyle)}
                  style={{ borderRadius: radius }}
                >
                  <img
                    src={p.img}
                    alt={p.name}
                    className="h-10 w-full object-cover"
                    style={{ borderTopLeftRadius: radius, borderTopRightRadius: radius }}
                  />
                  <div className="p-2">
                    <p className="text-xs font-semibold text-charcoal truncate">{p.name}</p>
                    <p className="text-xs font-bold" style={{ color: pal.accent }}>{p.price}</p>
                    {p.id === 0 && (
                      <span
                        className="mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
                        style={{ background: pal.accent }}
                      >
                        {conv.urgency || 'Hot'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
/**
 * A single theme swatch card in the selector rail.
 */
function ThemeCard({ theme, selectedId, onSelect }) {
  const pal = (theme.config && theme.config.palette) || {};
  const active = selectedId === theme.id;
  return (
    <button
      type="button"
      onClick={() => onSelect(theme)}
      className={`group relative flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition hover:bg-mist
        ${active ? 'border-blue-600 ring-2 ring-blue-600/30' : 'border-slate-200'}`}
    >
      <span className="h-6 w-6 shrink-0 rounded" style={{ background: pal.primary }} />
      <div className="min-w-0">
        <p className="text-sm font-bold text-charcoal group-hover:text-blue-700">{theme.name}</p>
        <p className="text-xs text-slate-500">{CATEGORY_LABELS[theme.category] || theme.category}</p>
      </div>
      {active && <IconCheck size={16} className="ml-auto text-blue-600" />}
    </button>
  );
}

/** Theme selector: catalog grid + live preview + apply. */
export default function SellerThemeSelector() {
  const [themes, setThemes] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [selected, setSelected] = useState(null);
  const [viewport, setViewport] = useState('desktop');
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    api
      .get('/api/themes')
      .then((data) => {
        const list = data.themes || [];
        setThemes(list);
        setSelected(list[0] || null);
      })
      .catch((e) => setFeedback({ ok: false, msg: e.message }))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return themes.filter((t) => {
      if (category !== 'all' && t.category !== category) return false;
      if (!q) return true;
      return `${t.name} ${t.category}`.toLowerCase().includes(q);
    });
  }, [themes, search, category]);

  async function applyTheme() {
    if (!selected || applying) return;
    setApplying(true);
    setFeedback(null);
    try {
      const res = await api.put('/api/store/theme', { active_theme_id: selected.id });
      setFeedback({ ok: true, msg: res.message || 'Theme applied to your store.' });
    } catch (e) {
      setFeedback({ ok: false, msg: e.message });
    } finally {
      setApplying(false);
    }
  }

  const categorySelected = selected ? CATEGORY_LABELS[selected.category] : 'Theme';
  return (
    <div className="space-y-5">
      {/* Top bar: search + category + viewport + apply */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="relative flex-1 min-w-[200px]">
          <IconSearch size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search themes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/30"
          />
        </div>

        <div className="relative">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="appearance-none rounded-xl border border-slate-200 bg-mist pl-3 pr-9 py-2 text-sm font-medium text-charcoal focus:outline-none focus:ring-2 focus:ring-blue-600/30"
          >
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
          <Filter size={16} className="pointer-events-none absolute right-2.5 top-2.5 text-slate-400" />
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-mist p-1 text-sm">
          <button
            type="button"
            onClick={() => setViewport('desktop')}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-sm font-medium
              ${viewport === 'desktop' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-charcoal'}`}
            title="Desktop preview"
          >
            <Monitor size={15} /> Desktop
          </button>
          <button
            type="button"
            onClick={() => setViewport('mobile')}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-sm font-medium
              ${viewport === 'mobile' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-charcoal'}`}
            title="Mobile preview"
          >
            <Smartphone size={15} /> Mobile
          </button>
        </div>

        <button
          type="button"
          onClick={applyTheme}
          disabled={!selected || applying}
          className="ml-auto flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {applying ? <LayoutGrid size={16} className="animate-pulse" /> : <IconCheck size={16} />}
          Apply Theme
        </button>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium
            ${feedback.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}
        >
          {feedback.ok ? <IconCheck size={16} /> : <IconAlert size={16} />}
          {feedback.msg}
        </div>
      )}
      {/* Catalog + live preview grid */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Theme catalog */}
        <div className="xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              {filtered.length} templates in {category === 'all' ? 'all categories' : CATEGORY_LABELS[category]}
            </h2>
            <span className="text-xs text-slate-400">Tap a swatch to preview</span>
          </div>
          {loading ? (
            <div className="flex h-40 items-center justify-center text-slate-400">
              <LayoutGrid size={24} className="animate-pulse" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {filtered.map((t) => (
                <ThemeCard
                  key={t.id}
                  theme={t}
                  selectedId={selected && selected.id}
                  onSelect={setSelected}
                />
              ))}
              {filtered.length === 0 && (
                <p className="text-sm text-slate-400">No themes matched your filters.</p>
              )}
            </div>
          )}
        </div>

        {/* Live preview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Live preview: {categorySelected}
            </h2>
            <Eye size={18} className="text-slate-400" />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            {selected ? (
              <ThemePreview theme={selected} viewport={viewport} />
            ) : (
              <div className="flex h-40 items-center justify-center text-slate-400">
                <LayoutGrid size={20} /> Select a theme to preview
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Viewport: {viewport} · {selected ? selected.id : 'no selection'}
          </p>
        </div>
      </div>
    </div>
  );
}