/**
 * Ghana Stores - Shared domain helpers
 */

/**
 * Normalize any Ghanaian phone input into international MSISDN format
 * accepted by Arkesel SMS and Hubtel MoMo APIs.
 * Accepts: 0244123456 | 244123456 | +233244123456 | 00233244123456
 * Returns "233XXXXXXXXX" or null when invalid.
 */
export function normalizeGhPhone(input) {
  if (!input || typeof input !== 'string') return null;
  let digits = String(input).replace(/[^\d]/g, '');
  if (digits.startsWith('00233')) digits = digits.slice(5);
  else if (digits.startsWith('233')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  // Valid Ghana mobile prefixes after stripping: length 9, starts 2/5 (e.g. 24, 54, 20, 27, 57...)
  if (digits.length !== 9 || !/^[25]\d{8}$/.test(digits)) return null;
  return `233${digits}`;
}

/** Format an amount as Ghana Cedi text, e.g. "GHS 1,250.00". */
export function formatGhs(value, { symbol = false } = {}) {
  const n = Number(value ?? 0);
  const formatted = n.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return symbol ? `GH\u20B5 ${formatted}` : `GHS ${formatted}`;
}

/** Human-readable unique order number: GS-YYMMDD-XXXX */
export function generateOrderNumber() {
  const d = new Date();
  const ymd = [
    String(d.getFullYear()).slice(-2),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `GS-${ymd}-${rand}`;
}

/** URL-safe store slug from a merchant shop name. */
export function slugifyStoreName(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Points earned for a spend amount given the store's earn rate. */
export function pointsForSpend(amount, pointsPerGhs) {
  return Math.floor(Number(amount || 0) * Number(pointsPerGhs || 0));
}

/** GHS discount value for a set of redeemed points. */
export function redeemValue(points, pointValueGhs) {
  return Math.round(points * Number(pointValueGhs || 0) * 100) / 100;
}

/** Clamp + integer guard for quantities and points. */
export function toIntOr(v, fallback = 0) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Round money to pesewas (2 dp). */
export function money(v) {
  return Math.round(Number(v || 0) * 100) / 100;
}
