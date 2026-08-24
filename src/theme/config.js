/**
 * theme/config.js
 * Single source of truth for storefront theming: token vocabulary,
 * deep-merge normalisation, published-theme seeding, page registry,
 * immutable token writes and the Additional-CSS scoper.
 *
 * Consumers: DashboardLayout (accordion panel), pages/ThemeCustomizer
 * (preview canvas), storefront components.
 */

/* ----------------------------- Token vocabulary ---------------------------- */
export const FONT_OPTIONS = [
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
    about_body: 'We source authentic, high-quality goods directly from trusted makers and farmers across the country, so every purchase supports local families and communities.',
    contact_email: 'hello@myghanastore.com',
    contact_phone: '+233 20 123 4567',
    contact_address: '12 Oxford Street, Osu, Ghana',
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

/**
 * Translate a theme TEMPLATE config (the /api/themes shape: palette, hero,
 * seo, typography, layout, borderRadius) into customizer tokens so the
 * customizer opens the ACTIVE theme instead of the schema defaults.
 * Preserves template name; falls back to defaults for anything missing.
 */
export function templateToCustomizerTokens(theme) {
  const cfg = theme?.config || {};
  return normalizeCustomThemeConfig(
    seedConfigFromTheme({
      ...cfg,
      seo: {
        ...(cfg.seo || {}),
        defaultTitle: theme?.name || cfg?.seo?.defaultTitle || DEFAULT_CUSTOM_THEME_CONFIG.branding.site_title,
      },
      hero: {
        ...(cfg.hero || {}),
        subtitle: cfg?.hero?.subtitle || cfg?.tagline || '',
      },
    }),
  );
}

/** Immutable write of a dot-path token (returns a new config object). */
export function setTokenPath(config, path, value) {
  const next = JSON.parse(JSON.stringify(config));
  const keys = path.split('.');
  let node = next;
  for (let i = 0; i < keys.length - 1; i++) node = node[keys[i]];
  node[keys[keys.length - 1]] = value;
  return next;
}

/** Storefront pages available inside the simulated device frame. */
export const PAGE_TABS = [
  { key: 'home', label: 'Home' },
  { key: 'shop', label: 'Shop' },
  { key: 'product', label: 'Product' },
  { key: 'cart', label: 'Cart' },
  { key: 'about', label: 'About Us' },
  { key: 'contact', label: 'Contact' },
];

/**
 * Scope merchant "Additional CSS" under [data-gs-preview] so raw rules
 * can never leak into the dashboard shell. Handles @media nesting;
 * comments are stripped first.
 */
export function scopeCss(css) {
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
    if (sel.startsWith('@media')) out.push(`${sel}{${scopeCss(body).split(`${scope} `).join('')}}`);
    else if (sel.startsWith('@')) out.push(`${sel}{${body}}`);
    else if (sel) out.push(`${sel.split(',').map((x) => `${scope} ${x.trim()}`).join(',')}{${body}}`);
    i = close + 1;
  }
  return out.join('\n');
}
