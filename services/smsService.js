import axios from 'axios';
import { pool } from '../config/database.js';

const {
  ARKESEL_API_KEY,
  ARKESEL_SENDER_ID = 'GhanaStores',
  ARKESEL_BASE_URL = 'https://sms.arkesel.com/api/v2',
} = process.env;

const arkeselClient = axios.create({
  baseURL: ARKESEL_BASE_URL,
  headers: { 'api-key': ARKESEL_API_KEY },
  timeout: 10_000,
});

/**
 * Sends a transactional SMS via Arkesel and logs it against the store
 * for audit / support purposes. Never throws on delivery failure — a
 * failed SMS should not roll back the business action that triggered it
 * (e.g. an order can still succeed even if the receipt SMS fails).
 */
export async function sendSms({ storeId = null, toPhone, message, purpose }) {
  let status = 'SENT';
  try {
    await arkeselClient.post('/sms/send', {
      sender: ARKESEL_SENDER_ID,
      message,
      recipients: [normalizeGhPhone(toPhone)],
    });
  } catch (err) {
    status = 'FAILED';
    console.error(`[smsService] Failed to send "${purpose}" SMS to ${toPhone}:`, err.message);
  }

  try {
    await pool.query(
      `INSERT INTO sms_logs (store_id, to_phone, message, purpose, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [storeId, toPhone, message, purpose, status]
    );
  } catch (logErr) {
    console.error('[smsService] Failed to write sms_logs row:', logErr.message);
  }

  return { status };
}

function normalizeGhPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('233')) return `+${digits}`;
  if (digits.startsWith('0')) return `+233${digits.slice(1)}`;
  return `+233${digits}`;
}

// ---- Message templates used across the platform ----

export const templates = {
  welcome: (storeName, storefrontUrl, trialEndsAt) =>
    `Welcome to Ghana Stores! Your storefront "${storeName}" is live at ${storefrontUrl}. ` +
    `Your 14-day free trial ends on ${formatDate(trialEndsAt)}. Start adding products now.`,

  trialReminderDay11: (storeName, trialEndsAt) =>
    `Hi ${storeName}, your Ghana Stores free trial ends on ${formatDate(trialEndsAt)} (3 days left). ` +
    `Renew now to keep your storefront online without interruption.`,

  pastDue: (storeName, graceEndsAt) =>
    `Hi ${storeName}, your Ghana Stores trial has ended and your account is now past due. ` +
    `Renew before ${formatDate(graceEndsAt)} to avoid your storefront being suspended.`,

  suspended: (storeName) =>
    `Hi ${storeName}, your Ghana Stores storefront has been suspended due to a past-due balance. ` +
    `Renew anytime to reactivate instantly.`,

  lowStock: (productName, variantLabel, quantityLeft) =>
    `Low stock alert: "${productName}" (${variantLabel}) has only ${quantityLeft} units left. Restock soon to avoid missed sales.`,

  payoutConfirmation: (amountGhs, momoNumber) =>
    `GHS ${amountGhs.toFixed(2)} has been sent to your Mobile Money wallet (${maskPhone(momoNumber)}). Funds should reflect within minutes.`,
};

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function maskPhone(phone) {
  return phone.replace(/(\d{3})\d+(\d{2})$/, '$1*****$2');
}

export default { sendSms, templates };
