import dotenv from 'dotenv';
import { pool } from '../config/database.js';
import { sendSms, templates } from '../services/smsService.js';

dotenv.config();

const GRACE_PERIOD_DAYS = Number(process.env.GRACE_PERIOD_DAYS || 3);

/**
 * Day-11 reminder: trial ends in 3 days.
 */
async function sendTrialReminders() {
  const { rows } = await pool.query(
    `SELECT id, store_name, phone, trial_ends_at
     FROM stores
     WHERE status = 'TRIALING'
       AND trial_ends_at::date = (now() + INTERVAL '3 days')::date`
  );

  for (const store of rows) {
    await sendSms({
      storeId: store.id,
      toPhone: store.phone,
      purpose: 'TRIAL_REMINDER',
      message: templates.trialReminderDay11(store.store_name, store.trial_ends_at),
    });
    await pool.query(
      `INSERT INTO billing_events (store_id, event_type) VALUES ($1, 'TRIAL_REMINDER')`,
      [store.id]
    );
  }

  return rows.length;
}

/**
 * Day 14: trial has ended and no renewal has landed — move to PAST_DUE
 * and start the 3-day grace period clock.
 */
async function moveExpiredTrialsToPastDue() {
  const { rows } = await pool.query(
    `UPDATE stores
     SET status = 'PAST_DUE',
         grace_ends_at = now() + INTERVAL '${GRACE_PERIOD_DAYS} days'
     WHERE status = 'TRIALING' AND trial_ends_at <= now()
     RETURNING id, store_name, phone, grace_ends_at`
  );

  for (const store of rows) {
    await sendSms({
      storeId: store.id,
      toPhone: store.phone,
      purpose: 'TRIAL_REMINDER',
      message: templates.pastDue(store.store_name, store.grace_ends_at),
    });
    await pool.query(
      `INSERT INTO billing_events (store_id, event_type) VALUES ($1, 'PAST_DUE')`,
      [store.id]
    );
  }

  return rows.length;
}

/**
 * After the grace period elapses with no renewal, suspend the store —
 * this takes the storefront offline via resolveStoreFromHost's status check.
 */
async function suspendOverdueStores() {
  const { rows } = await pool.query(
    `UPDATE stores
     SET status = 'SUSPENDED'
     WHERE status = 'PAST_DUE' AND grace_ends_at <= now()
     RETURNING id, store_name, phone`
  );

  for (const store of rows) {
    await sendSms({
      storeId: store.id,
      toPhone: store.phone,
      purpose: 'TRIAL_REMINDER',
      message: templates.suspended(store.store_name),
    });
    await pool.query(
      `INSERT INTO billing_events (store_id, event_type) VALUES ($1, 'SUSPENDED')`,
      [store.id]
    );
  }

  return rows.length;
}

/**
 * Runs the full daily billing sweep. This is the function Vercel Cron
 * calls (via GET /api/cron/billing, see server.js) once a day —
 * Vercel serverless functions are ephemeral, so there is no persistent
 * process here scheduling itself; the platform's cron is the scheduler.
 */
export async function runDailyBillingSweep() {
  const startedAt = new Date().toISOString();
  const remindersSent = await sendTrialReminders();
  const movedToPastDue = await moveExpiredTrialsToPastDue();
  const suspended = await suspendOverdueStores();

  const summary = { startedAt, remindersSent, movedToPastDue, suspended };
  console.log('[billingCron] Daily sweep complete:', summary);
  return summary;
}

// Manual/local run: `node jobs/billingCron.js --now`
// (In production this file is never imported directly — server.js exposes
// it through the /api/cron/billing route that Vercel Cron invokes on schedule.)
if (process.argv.includes('--now')) {
  runDailyBillingSweep()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[billingCron] Sweep failed:', err);
      process.exit(1);
    });
}

export default runDailyBillingSweep;
