/**
 * db/migrate.js
 * ---------------------------------------------------------------
 * Ghana Stores - Conversion-optimized storefront theme architecture.
 *
 * 1. Creates the `theme_templates` catalog table (versioned configs).
 * 2. Extends `stores` with `active_theme_id` (FK -> theme_templates) and
 *    `custom_theme_config` (JSONB overrides) so each tenant can activate a
 *    theme and layer per-store edits.
 * 3. Seeds 100 conversion-optimized theme presets via a nested 5 x 5 x 4
 *    matrix (retail category x Ghana-inspired palette x layout archetype).
 *    Border-radius tokens are cycled across the matrix.
 *
 * All writes use idempotent `INSERT ... ON CONFLICT (id) DO UPDATE`, so the
 * script is safe to re-run on every deploy.
 *
 * Tech stack: ES Modules + @vercel/postgres pool client.
 * The @vercel/postgres driver is lazy-imported so the pure matrix seeder is
 * importable / unit-testable without a live connection or the native driver.
 *
 * Run: npm run db:migrate   (requires DATABASE_URL -> Neon Postgres)
 */
import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';

dotenv.config();

/* -----------------------------------------------------------------*
 * Theme matrix definition
 * -----------------------------------------------------------------*/

/** 5 retail categories -> conversion hooks tuned per vertical. */
export const RETAIL_CATEGORIES = [
  { key: 'fashion',     label: 'Fashion & Apparel',     focus: 'apparel' },
  { key: 'electronics', label: 'Electronics & Gadgets', focus: 'tech' },
  { key: 'beauty',      label: 'Beauty & Cosmetics',    focus: 'beauty' },
  { key: 'marketplace', label: 'General Marketplace',   focus: 'general' },
  { key: 'groceries',   label: 'Groceries & Supermarket', focus: 'groceries' },
];

/** 5 Ghana-inspired color palettes (name + mood + palette tokens). */
export const PALETTES = [
  { key: 'accra_midnight', name: 'Accra Midnight',   tag: 'Dark',
    primary: '#0B1120', secondary: '#0F172A', accent: '#FFD700', background: '#FFFFFF',
    textPrimary: '#0B1120', textSecondary: '#475569' },
  { key: 'kumasi_gold',    name: 'Kumasi Gold',      tag: 'Warm Amber',
    primary: '#78350F', secondary: '#92400E', accent: '#F59E0B', background: '#FFFBEB',
    textPrimary: '#451A03', textSecondary: '#78350F' },
  { key: 'osu_emerald',    name: 'Osu Emerald',      tag: 'Tech Green',
    primary: '#064E35', secondary: '#065F4E', accent: '#10B981', background: '#ECFDF5',
    textPrimary: '#064E35', textSecondary: '#065F4E' },
  { key: 'volta_pure',     name: 'Volta Pure Light', tag: 'Minimal Blue',
    primary: '#0C4A6E', secondary: '#0EA5E9', accent: '#0EA5E9', background: '#F0F9FF',
    textPrimary: '#0C4A6E', textSecondary: '#334159' },
  { key: 'cape_coral',     name: 'Cape Coast Coral', tag: 'Pastel Red',
    primary: '#7F1D1D', secondary: '#B91C1C', accent: '#F87171', background: '#FEF2F2',
    textPrimary: '#450A0A', textSecondary: '#7F1D1D' },
];

/** 4 layout archetypes: grid columns x card style x hero banner toggle. */
export const LAYOUTS = [
  { key: 'dense_hero_bordered',    cols: 3, hero: true,  card: 'bordered', gridGap: '1rem' },
  { key: 'spacious_hero_minimal',  cols: 4, hero: true,  card: 'minimal',  gridGap: '1.25rem' },
  { key: 'compact_nohero_card',    cols: 3, hero: false, card: 'compact',  gridGap: '0.75rem' },
  { key: 'wide_nohero_list',       cols: 4, hero: false, card: 'minimal',  gridGap: '1rem' },
];

/** 4 border-radius design tokens, cycled across the 100 presets. */
export const BORDER_RADII = [
  { key: 'crisp',         label: 'Crisp',         rem: '0rem' },
  { key: 'subtle',        label: 'Subtle',        rem: '0.375rem' },
  { key: 'rounded',       label: 'Rounded',       rem: '0.75rem' },
  { key: 'extra_rounded', label: 'Extra Rounded', rem: '1.5rem' },
];

/** Total matrix: 5 x 5 x 4 = 100 unique presets. */
export const TOTAL_PRESETS =
  RETAIL_CATEGORIES.length * PALETTES.length * LAYOUTS.length;

/** Per-category conversion tuning (free-shipping threshold, trust signals). */
export const CONVERSION_TUNING = {
  fashion:     { freeShippingThresholdGHS: 80,  ctaText: 'Shop Now',   urgency: 'Trending' },
  electronics: { freeShippingThresholdGHS: 200, ctaText: 'Get Yours',  urgency: 'Hot Deals' },
  beauty:      { freeShippingThresholdGHS: 120, ctaText: 'Discover',   urgency: "Today's Picks" },
  marketplace: { freeShippingThresholdGHS: 150, ctaText: 'View All',   urgency: 'Best Sellers' },
  groceries:   { freeShippingThresholdGHS: 100, ctaText: 'Order Now',  urgency: 'Delivery in 60 min' },
};

/** Resolve a Ghana-relevant hero headline + subcopy for a category. */
function heroCopy(categoryFocus) {
  const copy = {
    apparel:     ['Express Your Style',       'Handpicked looks for every Ghanaian closet.'],
    tech:        ['Powered by Ghana',         'Latest gadgets, local prices, fast delivery.'],
    beauty:      ['Glow Your Way',            'Beauty that speaks to every skin tone.'],
    general:     ['One Market, Many Talents', 'From Accra craft to Kumasi textiles - all in one place.'],
    groceries:   ['Groceries at Your Door',   'Fresh from market, delivered same-day in Accra.'],
  };
  return copy[categoryFocus] || ['Welcome', 'Shop our curated collection.'];
}
/**
 * Build the full config JSONB payload for a single theme preset.
 */
function buildConfig(category, palette, layout, border) {
  const conv = CONVERSION_TUNING[category.focus] || CONVERSION_TUNING.marketplace;
  const [heroTitle, heroSub] = heroCopy(category.focus);
  const isDark = palette.background !== '#FFFFFF';

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    locale: {
      currency: 'GHS',
      currencySymbol: '₵',
      languageTag: 'en-GH',
      phonePrefix: '233',
      dateFormat: 'DD/MM/YYYY',
    },
    palette: {
      name: palette.name,
      tag: palette.tag,
      primary: palette.primary,
      secondary: palette.secondary,
      accent: palette.accent,
      background: palette.background,
      textPrimary: palette.textPrimary,
      textSecondary: palette.textSecondary,
      isDark,
    },
    layout: {
      gridColumns: layout.cols,
      heroBanner: layout.hero,
      heroHeight: layout.hero ? '560px' : '0px',
      cardStyle: layout.card,
      gridGap: layout.gridGap,
      productCardRounded: border.rem,
      showProductImages: true,
      showDiscountBadge: true,
      stickyHeader: true,
    },
    borderRadius: {
      base: border.rem,
      name: border.label,
      buttons: layout.card === 'compact' ? '0.375rem' : border.rem,
    },
    typography: {
      headingFont: 'Poppins, system-ui, sans-serif',
      bodyFont: 'Inter, system-ui, sans-serif',
      baseFontSize: 16,
      headingScale: 1.25,
      buttonWeight: 600,
    },
    hero: {
      enabled: layout.hero,
      title: heroTitle,
      subtitle: heroSub,
      callToAction: conv.ctaText,
      bgGradient: `${palette.primary}05, ${palette.background}`,
      overlay: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
    },
    sections: [
      { key: 'hero',          enabled: layout.hero, order: 1 },
      { key: 'urgency',       enabled: true,        order: 2, text: `${conv.urgency} · Shipping nationwide` },
      { key: 'categories',    enabled: true,        order: 3, columns: layout.cols },
      { key: 'products-grid', enabled: true,        order: 4, columns: layout.cols },
      { key: 'social-proof',  enabled: true,        order: 5, source: 'ratings' },
      { key: 'cta-banner',    enabled: true,        order: 6, text: `Free delivery on orders over ₵${conv.freeShippingThresholdGHS}` },
      { key: 'footer',        enabled: true,        order: 7 },
    ],
    conversion: {
      currency: 'GHS',
      freeShippingThresholdGHS: conv.freeShippingThresholdGHS,
      codEnabled: true,
      momoEnabled: true,
      mobileMoneyProviders: ['MTN MoMo', 'Vodafone Cash', 'AirtelTigo'],
      whatsappFab: true,
      whatsappCountryCode: '233',
      urgencyTicker: conv.urgency,
      lowStockBadge: true,
      mobileOptimized: true,
      trustBadges: [
        { label: 'GH Secured', icon: 'shield' },
        { label: '24-Hr Delivery', icon: 'clock' },
        { label: 'Cash or MoMo', icon: 'wallet' },
      ],
    },
    paymentBadges: ['MTN MoMo', 'Vodafone Cash', 'AirtelTigo', 'Cash on Delivery'],
    seo: {
      titleTemplate: `%s | ${category.label} Store`,
      defaultTitle: `${category.label} — Ghana Stores`,
      defaultDescription: `Discover the best ${category.label.toLowerCase()} in Ghana. Fast delivery, GHS prices, MoMo accepted.`,
      ogImage: `/api/og?title=${encodeURIComponent(category.label)}`,
    },
  };
}

/**
 * Generate the full 100-preset matrix (pure - no DB access).
 * @returns {Array<{id:string,name:string,category:string,config:object}>}
 */
export function buildPresets() {
  const presets = [];
  let globalIndex = 0;

  for (let ci = 0; ci < RETAIL_CATEGORIES.length; ci++) {
    const category = RETAIL_CATEGORIES[ci];
    for (let pi = 0; pi < PALETTES.length; pi++) {
      const palette = PALETTES[pi];
      for (let li = 0; li < LAYOUTS.length; li++) {
        const layout = LAYOUTS[li];
        const border = BORDER_RADII[globalIndex % BORDER_RADII.length];
        globalIndex++;

        const id = `${category.key}-${palette.key}-${layout.key}-${border.key}`;
        const name = `${category.label} · ${palette.name} (${palette.tag}) · ${layout.key}`;
        const config = buildConfig(category, palette, layout, border);

        presets.push({ id, name, category: category.key, config });
      }
    }
  }
  return presets;
}
/**
 * DDL: create the theme catalog + extend the tenant table.
 * theme_templates must exist before stores.active_theme_id can reference it.
 */
const DDL = [
  `CREATE TABLE IF NOT EXISTS theme_templates (
    id          VARCHAR(100) PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    category    VARCHAR(50)  NOT NULL,
    config      JSONB        NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  );`,
  `ALTER TABLE stores
     ADD COLUMN IF NOT EXISTS active_theme_id    VARCHAR(100)
       REFERENCES theme_templates(id),
     ADD COLUMN IF NOT EXISTS custom_theme_config JSONB
       NOT NULL DEFAULT '{}'::jsonb;`,
];

const UPSERT_SQL = `
  INSERT INTO theme_templates (id, name, category, config)
  VALUES ($1, $2, $3, $4)
  ON CONFLICT (id) DO UPDATE SET
    name     = EXCLUDED.name,
    category = EXCLUDED.category,
    config   = EXCLUDED.config
  RETURNING id;
`;

/**
 * Apply the theme architecture migration and seed the 100 preset themes.
 * Idempotent: safe to re-run on every deploy.
 */
export async function migrate() {
  const connectionString = process.env.DATABASE_URL || '';
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Configure a Neon Postgres connection string before running db:migrate.',
    );
  }

  // Lazy-load @vercel/postgres so the matrix seeder stays importable offline.
  const { Client } = await import('@vercel/postgres');

  let client;
  let ok = false;
  try {
    const isNeon = /\.neon\.tech/i.test(connectionString);
    client = new Client({
      connectionString,
      ssl: isNeon ? { rejectUnauthorized: false } : undefined,
      // Connection pool sizing - small for a bounded seed script.
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
    });
    await client.connect();
    console.log('[db:migrate] Connected to PostgreSQL.');

    // ---- 1. DDL (idempotent) ----
    console.log('[db:migrate] Applying DDL (theme_templates + stores columns) ...');
    for (const stmt of DDL) {
      await client.query(stmt);
    }
    console.log('[db:migrate] DDL applied.');

    // ---- 2. Algorithmic 100-preset matrix + idempotent upsert ----
    const presets = buildPresets();
    console.log(`[db:migrate] Seeding ${presets.length} theme presets (expected ${TOTAL_PRESETS}) ...`);

    let inserted = 0;
    for (let i = 0; i < presets.length; i++) {
      const p = presets[i];
      try {
        await client.query(UPSERT_SQL, [p.id, p.name, p.category, p.config]);
        inserted += 1;
      } catch (e) {
        console.warn(`[db:migrate] upsert failed for ${p.id}: ${e.message.split('\n')[0]}`);
      }
      if ((i + 1) % 25 === 0) {
        console.log(`[db:migrate] ... ${i + 1}/${presets.length} processed`);
      }
    }

    console.log(`[db:migrate] ✅ Seeded ${inserted}/${presets.length} theme templates (idempotent upsert).`);
    ok = true;
  } finally {
    if (client) {
      try {
        await client.end();
      } catch (e) {
        console.warn(`[db:migrate] client.end warning: ${e.message}`);
      }
    }
    if (!ok) {
      process.exitCode = 1;
    }
  }
}

/* --- Standalone execution guard (api/index.js imports this module) --- */
const invokedDirectly =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  migrate()
    .then(() => {
      console.log('[db:migrate] Migration complete.');
      process.exit(process.exitCode ?? 0);
    })
    .catch((err) => {
      console.error('[db:migrate] Migration failed:', err.message);
      process.exit(1);
    });
}