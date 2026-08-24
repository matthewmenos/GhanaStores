/**
 * SellerThemeMarketplace - WordPress-style theme discovery gallery.
 * The currently ACTIVE theme pins to the front of the grid and gets an
 * elevated, emerald-accented active card; every other template follows.
 *
 * STRICT RULE: pure SVG / Lucide icons only, ZERO emojis.
 */
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { IconCheck, IconAlert } from '../components/icons.jsx';
import {
  BadgeCheck, Eye, Filter, LayoutGrid, Palette, Search, Star, X,
} from 'lucide-react';

const CATEGORY_LABELS = {
  fashion: 'Fashion & Apparel',
  electronics: 'Electronics & Gadgets',
  beauty: 'Beauty & Cosmetics',
  marketplace: 'General Marketplace',
  groceries: 'Groceries & Supermarket',
};

const FILTER_PILLS = [
  { key: 'popular', label: 'Popular' },
  { key: 'minimal', label: 'Minimal' },
  { key: 'fashion', label: 'Fashion' },
  { key: 'electronics', label: 'Electronics' },
  { key: 'supermarket', label: 'Supermarket' },
];

/** Stable pseudo-rating derived from the template id (catalog cosmetics). */
function themeRating(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return Math.round((4.3 + (h % 7) / 10) * 10) / 10;
}

function themeReviews(id) {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 17 + id.charCodeAt(i)) >>> 0;
  return 40 + (h % 260);
}

/** Abstract "screenshot" preview banner drawn purely from theme tokens. */
function ThemeThumb({ palette: p, layout }) {
  const cols = layout?.gridColumns || 3;
  const radius = layout?.productCardRounded || '0.5rem';
  const cells = Array.from({ length: Math.min(cols * 2, 8) });
  return (
    <div className="h-full w-full select-none" style={{ background: p.background || '#ffffff' }} aria-hidden="true">
      <div className="flex h-5 items-center justify-between px-2" style={{ background: p.primary }}>
        <span className="h-1 w-8 rounded-full" style={{ background: 'rgba(255,255,255,.85)' }} />
        <span className="h-1 w-4 rounded-full" style={{ background: p.accent }} />
      </div>
      {layout?.heroBanner !== false && (
        <div
          className="mx-2 mt-1.5 flex h-10 flex-col items-start justify-center gap-1 rounded px-2"
          style={{ background: `linear-gradient(120deg, ${p.primary} 0%, ${p.accent} 130%)` }}
        >
          <span className="h-1.5 w-14 rounded-full bg-white/85" />
          <span className="h-1 w-9 rounded-full bg-white/50" />
        </div>
      )}
      <div className="grid gap-1.5 p-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
        {cells.map((_, i) => (
          <div key={i} className="overflow-hidden border border-slate-200/60" style={{ borderRadius: radius }}>
            <div className="h-7" style={{ background: i % 2 ? p.secondary : `${p.accent}26` }} />
            <div className="space-y-1 p-1.5">
              <span className="block h-1 w-4/5 rounded-full bg-slate-300" />
              <span className="block h-1 w-2/5 rounded-full" style={{ background: p.accent }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stars({ value }) {
  const filled = Math.round(value);
  return (
    <span className="flex items-center gap-0.5" aria-label={`Rated ${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={12} className={n <= filled ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} />
      ))}
    </span>
  );
}

function ThemeCard({ theme, isActive, isApplying, onApply, onPreview, isSolo }) {
  const pal = theme.config?.palette || {};
  const rating = themeRating(theme.id);
  return (
    <article
      className={`group relative overflow-hidden rounded-2xl border bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/70 ${
        isActive
          ? 'border-emerald-300 ring-2 ring-emerald-400/70 shadow-lg shadow-emerald-500/10'
          : 'border-slate-200'
      }`}
    >
      {/* Active theme banner strip */}
      {isActive && (
        <div className="flex items-center gap-1.5 bg-emerald-500 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white">
          <BadgeCheck size={12} /> {isSolo ? 'Your active theme' : 'Active theme'}
        </div>
      )}

      <div className={`relative aspect-[16/10] overflow-hidden ${isActive ? '' : 'border-b border-slate-100'}`}>
        <ThemeThumb palette={pal} layout={theme.config?.layout} />

        {/* Hover quick-actions - keyboard reachable via focus-within */}
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2.5 bg-slate-900/55 opacity-0 backdrop-blur-[1.5px] transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            onClick={onPreview}
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-charcoal shadow-sm transition hover:bg-mist focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Eye size={14} /> Live Preview
          </button>
          <button
            type="button"
            onClick={() => onApply(theme)}
            disabled={isActive || isApplying}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {isApplying ? <LayoutGrid size={14} className="animate-spin" /> : <IconCheck size={14} />}
            {isActive ? 'Published' : 'Apply Theme'}
          </button>
        </div>

        {!isActive && isApplying && (
          <span className="absolute left-2.5 top-2.5 z-20 inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-md">
            <LayoutGrid size={11} /> Applying
          </span>
        )}
      </div>

      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-sm font-bold text-charcoal" title={theme.name}>{theme.name}</h3>
          <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-slate-700">
            <Stars value={rating} /> {rating.toFixed(1)}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
            {CATEGORY_LABELS[theme.category] || theme.category}
          </span>
          <span className="ml-auto text-[10px] font-medium text-slate-400">{themeReviews(theme.id)} reviews</span>
        </div>
      </div>
    </article>
  );
}

export default function SellerThemeMarketplace() {
  const [themes, setThemes] = useState([]);
  const [search, setSearch] = useState('');
  const [pill, setPill] = useState('popular');
  const [activeId, setActiveId] = useState(null);
  const [applyingId, setApplyingId] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/api/themes'), api.get('/api/store/theme')])
      .then(([catalog, mine]) => {
        setThemes(catalog.themes || []);
        setActiveId(mine.activeThemeId || null);
      })
      .catch((e) => setFeedback({ ok: false, msg: e.message }))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = themes.filter((t) => {
      if (!q) return true;
      return `${t.name} ${t.category}`.toLowerCase().includes(q);
    });

    if (pill === 'popular') {
      list = [...list].sort((a, b) => themeRating(b.id) - themeRating(a.id));
    } else if (pill === 'minimal') {
      list = list.filter((t) => {
        const l = t.config?.layout || {};
        return l.cardStyle === 'minimal' || l.heroBanner === false;
      });
    } else if (pill === 'supermarket') {
      list = list.filter((t) => t.category === 'groceries');
    } else if (pill !== 'all') {
      list = list.filter((t) => t.category === pill);
    }

    /* Active theme ALWAYS pins to the front, then the rest. */
    const pinned = list.filter((t) => t.id === activeId);
    const rest = list.filter((t) => t.id !== activeId);
    return [...pinned, ...rest];
  }, [themes, search, pill, activeId]);

  async function applyTheme(theme) {
    if (applyingId) return;
    setApplyingId(theme.id);
    setFeedback(null);
    try {
      await api.put('/api/store/theme', { active_theme_id: theme.id });
      setActiveId(theme.id);
      setFeedback({ ok: true, msg: `"${theme.name}" is now your active theme.` });
    } catch (e) {
      setFeedback({ ok: false, msg: e.message });
    } finally {
      setApplyingId(null);
    }
  }

  function openDemo(theme) {
    window.location.hash = `#/dashboard/themes/demo/${encodeURIComponent(theme.id)}`;
  }

  const activeTheme = themes.find((t) => t.id === activeId);
  const soloActive = activeTheme && visible.length === 1 && visible[0].id === activeId;

  return (
    <div className="min-h-screen space-y-5 bg-slate-100/60 p-4 pb-16 sm:p-6">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 px-5 py-8 text-white sm:px-8 sm:py-10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-blue-600/20 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-52 w-52 rounded-full bg-emerald-500/10 blur-3xl" aria-hidden="true" />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-200">
              <LayoutGrid size={12} /> Theme Marketplace
            </p>
            <h1 className="mt-3 max-w-xl text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
              Give your storefront a conversion-ready look
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-300">
              Preview any theme live in the sandbox, then make it yours. When a theme is active it stays pinned to the front.
            </p>
          </div>
          <a
            href="#/dashboard/themes/customizer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/95 px-3 py-1.5 text-xs font-bold text-charcoal shadow-lg transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Palette size={13} /> Open Customizer
          </a>
        </div>

        <div className="relative mt-6 max-w-xl">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or category..."
            aria-label="Search themes"
            className="w-full rounded-xl border border-white/10 bg-white/95 py-3 pl-11 pr-4 text-sm font-medium text-charcoal shadow-lg outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </section>

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter themes">
        <Filter size={15} className="mr-1 text-slate-400" aria-hidden="true" />
        {FILTER_PILLS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setPill(key)}
            aria-pressed={pill === key}
            className={`rounded-full border px-4 py-1.5 text-xs font-bold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              pill === key
                ? 'border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-600/25'
                : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700'
            }`}
          >
            {label}
          </button>
        ))}
        {activeId && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
            <BadgeCheck size={12} /> Active theme pinned first
          </span>
        )}
      </div>

      {/* Feedback toast */}
      {feedback && (
        <div role="status" className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${feedback.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {feedback.ok ? <IconCheck size={16} /> : <IconAlert size={16} />}
          {feedback.msg}
          <button type="button" onClick={() => setFeedback(null)} className="ml-auto rounded p-0.5 hover:bg-black/5" aria-label="Dismiss message">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Results meta */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-slate-500" aria-live="polite">
          Showing {visible.length} of {themes.length} templates
          {pill !== 'popular' ? ` - ${FILTER_PILLS.find((p) => p.key === pill)?.label}` : ''}
        </p>
        {activeTheme && (
          <p className="hidden items-center gap-1.5 text-xs font-bold text-emerald-700 sm:flex">
            <BadgeCheck size={13} /> {activeTheme.name} is live on your storefront
          </p>
        )}
      </div>

      {/* Template grid - active theme first */}
      {loading ? (
        <div className="flex h-64 items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white text-slate-400">
          <LayoutGrid size={22} className="animate-pulse" />
          <span className="text-sm font-medium">Loading the catalog...</span>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <LayoutGrid size={28} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-500">No templates match your filters.</p>
          <button
            type="button"
            onClick={() => { setPill('popular'); setSearch(''); }}
            className="mt-3 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((t) => (
            <ThemeCard
              key={t.id}
              theme={t}
              isActive={t.id === activeId}
              isApplying={applyingId === t.id}
              isSolo={soloActive}
              onApply={applyTheme}
              onPreview={() => openDemo(t)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
/* __M3__ */