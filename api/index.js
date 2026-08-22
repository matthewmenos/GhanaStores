// Vercel serverless entry point. Every request to /api/* is routed here
// (see the rewrite in vercel.json) and handled by the shared Express app
// in server.js — including /api/cron/billing, which Vercel Cron invokes
// on schedule.
import app from '../server.js';

export default app;
