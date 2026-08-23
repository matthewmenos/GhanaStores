/**
 * Ghana Stores - Billing Cron Engine
 *
 * Daily lifecycle automation for the 14-day free trial:
 *   Day 11  -> SMS renewal reminder to TRIAL stores
 *   Day 14+ -> TRIAL stores flip to PAST_DUE + SMS
 *   Day 17+ -> PAST_DUE stores past the 3-day grace period -> SUSPENDED + SMS
 *
 * Runs at 08:00 Africa/Accra when ENABLE_CRON=true, and every exported
 * function is callable directly for tests/manual triggers.
 */
import cron from 'node-cron';
import { query } from '../config/database.js';
import {
  sendTrialReminderSms,
  sendPastDueSms,
  sendSuspensionSms,
} from '../services/smsService.js';

/** Day 11: nudge merchants before expiry. */
export async function runRenewalReminders() {
  const { rows } = await query(
    `SELECT id, name, phone, trial_ends_at
       FROM stores
      WHERE status = 'TRIAL'
        AND trial_ends_at::date - CURRENT_DATE = 11`,
  );
  let sent = 0;
  for (const store of rows) {
    const res = await sendTrialReminderSms(store);
    if (res?.ok) sent += 1;
  }
  console.log(`[cron] renewal reminders sent: ${sent}/${rows.length}`);
  return sent;
}

/** Day 14+: expired trials move to PAST_DUE (grace period starts). */
export async function runExpireTrials() {
  const { rows } = await query(
    `UPDATE stores
        SET status = 'PAST_DUE'
      WHERE status = 'TRIAL'
        AND trial_ends_at <= NOW()
      RETURNING id, name, phone, trial_ends_at, grace_ends_at`,
  );
  for (const store of rows) {
    await sendPastDueSms(store);
  }
  console.log(`[cron] trials moved to PAST_DUE: ${rows.length}`);
  return rows.length;
}

/** Trial end + 3-day grace elapsed -> hard suspension. */
export async function runSuspendOverdue() {
  const { rows } = await query(
    `UPDATE stores
        SET status = 'SUSPENDED'
      WHERE status = 'PAST_DUE'
        AND COALESCE(grace_ends_at, trial_ends_at + INTERVAL '3 days') <= NOW()
      RETURNING id, name, phone`,
  );
  for (const store of rows) {
    await sendSuspensionSms(store);
  }
  console.log(`[cron] stores suspended after grace period: ${rows.length}`);
  return rows.length;
}

/** Full daily cycle in dependency order. */
export async function runBillingCycle() {
  try {
    await runRenewalReminders();
    await runExpireTrials();
    await runSuspendOverdue();
  } catch (err) {
    console.error('[cron] billing cycle failed:', err.message);
  }
}

let scheduledTask = null;

export function startBillingCron() {
  if (scheduledTask) return scheduledTask;
  const enabled = String(process.env.ENABLE_CRON || '').toLowerCase() === 'true';
  if (!enabled) {
    console.log('[cron] ENABLE_CRON=false - billing scheduler idle (run manually via jobs API).');
    return null;
  }
  // 08:00 Accra time (GMT+0) daily.
  scheduledTask = cron.schedule('0 8 * * *', runBillingCycle, {
    timezone: 'Africa/Accra',
    name: 'ghana-stores-billing',
  });
  console.log('[cron] billing scheduler active - daily at 08:00 Africa/Accra.');
  return scheduledTask;
}

export function stopBillingCron() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('[cron] billing scheduler stopped.');
  }
}

export default { startBillingCron, stopBillingCron, runBillingCycle };
