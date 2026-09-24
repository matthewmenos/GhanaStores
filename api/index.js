/**
 * DiDwa - Vercel Serverless Entry Point
 * Wraps the modular Express application (../server.js) as a single Node
 * serverless function. vercel.json routes /api/* and /health here, while the
 * built Vite PWA in dist/ is served from Vercel's edge network.
 *
 * The pg connection pool lives at module scope, so warm invocations reuse
 * connections; cold starts are bounded by PGPOOL_MAX (see config/database.js).
 */
import app from '../server.js';

export default async function handler(req, res) {
  return app(req, res);
}
