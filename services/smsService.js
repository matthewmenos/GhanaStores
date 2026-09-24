/**
 * DiDwa - Arkesel Transactional SMS Service
 * https://developers.arkesel.com/
 *
 * When ARKESEL_API_KEY is missing the service runs in DRY_RUN mode:
 * messages are logged to the console instead of being dispatched,
 * so local development never fails on integrations.
 */
import axios from 'axios';
import { formatGhs } from '../utils/helpers.js';

const ARKESEL_BASE = process.env.ARKESEL_BASE_URL || 'https://sms.arkesel.com/api/v2';
const API_KEY = process.env.ARKESEL_API_KEY || '';
const SENDER_ID = process.env.ARKESEL_SENDER_ID || 'DiDwa';

/** Serverless safety: cap the HTTP attempt so it finishes inside Vercel's
 *  function time budget (Hobby maxDuration = 10s) instead of 504ing. */
const ON_VERCEL = Boolean(process.env.VERCEL);

export const smsDryRun = !API_KEY;

const client = axios.create({
  baseURL: ARKESEL_BASE,
  timeout: ON_VERCEL ? 8_000 : 15_000,
  headers: { 'api-key': API_KEY, 'Content-Type': 'application/json' },
});

/** Low-level send. `recipients`: array of normalized 233XXXXXXXXX numbers. */
export async function sendSms(recipients, message) {
  const list = Array.isArray(recipients) ? recipients : [recipients];
  if (list.length === 0) return { ok: false, reason: 'no-recipients' };

  if (smsDryRun) {
    console.log(`[sms:DRY_RUN] to=${list.join(',')} sender=${SENDER_ID}\n${message}\n`);
    return { ok: true, dryRun: true, messageId: `dry-${Date.now()}` };
  }

  try {
    const { data } = await client.post('/sms/send', {
      sender: SENDER_ID,
      recipients: list,
      message,
    });
    const ok = data?.status === 'success' || data?.code === 'ok' || data?.data;
    if (!ok) console.error('[sms] unexpected Arkesel response:', JSON.stringify(data));
    return { ok: Boolean(ok), raw: data };
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('[sms] dispatch failed:', detail);
    return { ok: false, error: detail };
  }
}

/* ------------------------- Module 1: lifecycle SMS ------------------------- */

function formatDate(tzDate) {
  return new Date(tzDate).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** Registration welcome: storefront URL + trial expiry (Module 1). */
export async function sendWelcomeSms(store) {
  const platformDomain = (process.env.PLATFORM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const storefront = store.custom_domain
    ? `https://${String(store.custom_domain).replace(/^https?:\/\//, '').replace(/\/+$/, '')}`
    : (store.subdomain_slug && platformDomain
      ? `https://${store.subdomain_slug}.${platformDomain}`
      : 'your DiDwa storefront');
  const expires = formatDate(store.trial_ends_at);
  const message =
    `Welcome to DiDwa, ${store.name}!\n` +
    `Your 14-day FREE trial is live until ${expires}.\n` +
    `Storefront: ${storefront}\n` +
    `No upfront payment needed. Sell smarter today.`;
  return sendSms([store.phone], message);
}

/** Day 11 renewal reminder. */
export async function sendTrialReminderSms(store) {
  const expires = formatDate(store.trial_ends_at);
  const message =
    `Hi ${store.name}, your DiDwa free trial ends ${expires} (3 days left).\n` +
    `Keep your storefront open - renew now to avoid interruption. Your data stays safe.`;
  return sendSms([store.phone], message);
}

/** Day 14: trial over, moved to PAST_DUE (grace active). */
export async function sendPastDueSms(store) {
  const graceEnds = formatDate(store.grace_ends_at || new Date(Date.now() + 3 * 86_400_000));
  const message =
    `DiDwa: your free trial has ended. Your account is PAST DUE.\n` +
    `Grace period runs until ${graceEnds} - subscribe before then to keep selling.`;
  return sendSms([store.phone], message);
}

/** Day 17 (trial end + 3-day grace): suspension notice. */
export async function sendSuspensionSms(store) {
  const message =
    `DiDwa: ${store.name} has been SUSPENDED after the grace period.\n` +
    `Subscribe anytime to instantly restore your storefront, inventory and sales history.`;
  return sendSms([store.phone], message);
}

/* -------------------- Module 6: low-stock variant alerts ------------------- */

export async function sendLowStockAlertSms(store, lowVariants) {
  if (!Array.isArray(lowVariants) || lowVariants.length === 0) {
    return { ok: false, reason: 'nothing-low' };
  }
  const lines = lowVariants
    .slice(0, 6)
    .map((v) => `- ${v.product_name} (${v.option_value}): ${Number(v.stock_quantity)} left`)
    .join('\n');
  const more = lowVariants.length > 6 ? `\n+${lowVariants.length - 6} more item(s)...` : '';
  const message =
    `LOW STOCK ALERT - ${store.name}\n` +
    `The following variant(s) hit their re-order threshold:\n${lines}${more}\n` +
    `Restock now to keep selling.`;
  return sendSms([store.phone], message);
}

/* --------------------------- payout confirmation --------------------------- */

export async function sendPayoutSms(store, payout) {
  const message =
    `PAYOUT ${payout.status}: ${formatGhs(payout.amount)} sent to ${payout.destination}` +
    ` (${payout.network}).\nRef: ${payout.reference || 'n/a'}\nDiDwa Wallet`;
  return sendSms([store.phone], message);
}

export default {
  sendSms,
  sendWelcomeSms,
  sendTrialReminderSms,
  sendPastDueSms,
  sendSuspensionSms,
  sendLowStockAlertSms,
  sendPayoutSms,
  get dryRun() { return smsDryRun; },
};
