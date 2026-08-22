import cron from 'node-cron';
import dotenv from 'dotenv';
import { pool } from '../config/database.js';
import { sendSms, templates } from '../services/smsService.js';

dotenv.config();

const TRIAL_LENGTH_DAYS = Number(process.env.TRIAL_LENGTH_DAYS || 14);
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

  console.log(`[billingCron] Sent ${rows.length} trial reminder(s).`);
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

  console.log(`[billingCron] Moved ${rows.length} store(s) to PAST_DUE.`);
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

  console.log(`[billingCron] Suspended ${rows.length} overdue store(s).`);
}

async function runDailyBillingSweep() {
  console.log(`[billingCron] Running daily sweep at ${new Date().toISOString()}`);
  try {
    await sendTrialReminders();
    await moveExpiredTrialsToPastDue();
    await suspendOverdueStores();
  } catch (err) {
    console.error('[billingCron] Sweep failed:', err);
  }
}

// Runs once a day at 07:00 Africa/Accra — early enough that merchants see
// the SMS before their business day starts.
cron.schedule('0 7 * * *', runDailyBillingSweep, { timezone: 'Africa/Accra' });

// Allow `node jobs/billingCron.js --now` for manual/on-demand runs (e.g. in CI or a one-off ops fix)
if (process.argv.includes('--now')) {
  runDailyBillingSweep().then(() => process.exit(0));
}

export default runDailyBillingSweep;
