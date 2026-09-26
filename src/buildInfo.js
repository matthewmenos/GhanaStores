/**
 * Build identity, injected at build time by vite.config.js via
 * `define.__BUILD_META__`. Surfaced in the UI so "is the new build live?" is
 * answerable at a glance instead of by comparing bundle hashes in devtools.
 */
const meta = typeof __BUILD_META__ !== 'undefined'
  ? __BUILD_META__
  : { commit: 'dev', builtAt: '' };

export const BUILD_COMMIT = meta.commit;
export const BUILD_TIME = meta.builtAt ? new Date(meta.builtAt).toUTCString() : 'unknown';

/** Short label, e.g. "build 791635c - 25 Sep 2026 09:12:00 GMT". */
export const buildLabel = `build ${BUILD_COMMIT} - ${BUILD_TIME}`;

export default { BUILD_COMMIT, BUILD_TIME, buildLabel };