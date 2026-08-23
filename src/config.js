/**
 * Client-side platform configuration.
 *
 * The storefront host is built from VITE_PLATFORM_DOMAIN (Vite exposes any
 * env var prefixed with VITE_ to the browser bundle) so white-label
 * deployments only change one value - mirroring the API's PLATFORM_DOMAIN.
 *
 * Accepted shapes for VITE_PLATFORM_DOMAIN:
 *   ghastores.com              -> https://<slug>.ghastores.com
 *   https://mybrand.com        -> https://<slug>.mybrand.com
 *   http://lvh.me:5173         -> http://<slug>.lvh.me:5173  (local dev)
 */
const RAW = String(import.meta.env.VITE_PLATFORM_DOMAIN || 'ghastores.com').trim();
const SCHEME = /^http:\/\//i.test(RAW) ? 'http' : 'https';

/** Apex/platform domain without protocol or trailing slashes. */
export const PLATFORM_DOMAIN = RAW.replace(/^https?:\/\//i, '').replace(/\/+$/, '');

/** Build a tenant storefront URL from its subdomain slug. */
export function storefrontUrl(slug) {
  return `${SCHEME}://${slug || 'shop'}.${PLATFORM_DOMAIN}`;
}
