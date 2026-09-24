/**
 * Client-side platform configuration.
 *
 * The storefront host is built from VITE_PLATFORM_DOMAIN (Vite exposes any
 * env var prefixed with VITE_ to the browser bundle) so white-label
 * deployments only change one value - mirroring the API's PLATFORM_DOMAIN.
 *
 * Accepted shapes for VITE_PLATFORM_DOMAIN:
 *   didwaghana.com              -> https://<slug>.didwaghana.com
 *   https://mybrand.com        -> https://<slug>.mybrand.com
 *   http://lvh.me:5173         -> http://<slug>.lvh.me:5173  (local dev)
 */
const RAW = String(import.meta.env.VITE_PLATFORM_DOMAIN || '').trim();
if (!RAW) {
  console.warn('[config] VITE_PLATFORM_DOMAIN is not set; seller storefront URLs cannot be built.');
}
const SCHEME = /^http:\/\//i.test(RAW) ? 'http' : 'https';

/** Apex/platform domain without protocol or trailing slashes. */
export const PLATFORM_DOMAIN = RAW.replace(/^https?:\/\//i, '').replace(/\/+$/, '');

/**
 * Build the seller's canonical storefront URL from persisted store data.
 * A custom domain wins; otherwise the automatically allocated slug is used.
 * No arbitrary fallback such as `shop` is permitted.
 */
export function storefrontUrl(storeOrSlug) {
  const store = typeof storeOrSlug === 'string'
    ? { subdomain_slug: storeOrSlug }
    : (storeOrSlug || {});
  const custom = String(store.custom_domain || store.customDomain || '').trim();
  const slug = String(store.subdomain_slug || store.subdomainSlug || '').trim();
  const host = custom || (slug && PLATFORM_DOMAIN ? `${slug}.${PLATFORM_DOMAIN}` : '');
  return host ? `${SCHEME}://${host}` : '';
}
