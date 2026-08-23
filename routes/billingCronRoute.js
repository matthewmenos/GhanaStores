/**
 * Ghana Stores - Billing Cron Route (Vercel Cron Jobs)
 *
 *   GET /api/cron/billing
 *
 * Runs the full 14-day-trial lifecycle automation every day:
 *   Day 11  -> Arkesel SMS renewal reminders to TRIAL stores
 *   Day 14  -> expired TRIAL stores flip to PAST_DUE (grace starts) + SMS
 *   Day 17  -> PAST_DUE past the 3-day grace -> SUSPENDED + SMS
 *
 * Secured with `Authorization: Bearer $CRON_SECRET`. Vercel attaches that
 * header automatically when CRON_SECRET exists in Project Environment
 * Variables. In local dev (no CRON_SECRET) the endpoint still runs so manual
 * triggers / tests work, but it logs a loud warning.
 */
import { Router } from 'express';
import {
  runRenewalReminders,
  runExpireTrials,
  runSuspendOverdue,
} from '../jobs/billingCron.js';

const router = Router();

export async function billingCronHandler(req, res, next) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const provided = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (provided !== secret) {
        return res.status(401).json({ error: 'Unauthorized cron invocation.' });
      }
    } else {
      console.warn('[cron] CRON_SECRET is not set - /api/cron/billing is unauthenticated. Set it before going live.');
    }

    const renewalRemindersSent = await runRenewalReminders();
    const trialsMovedToPastDue = await runExpireTrials();
    const storesSuspended = await runSuspendOverdue();

    return res.json({
      ok: true,
      ranAt: new Date().toISOString(),
      result: { renewalRemindersSent, trialsMovedToPastDue, storesSuspended },
    });
  } catch (err) {
    return next(err);
  }
}

router.get('/billing', billingCronHandler);

export default router;