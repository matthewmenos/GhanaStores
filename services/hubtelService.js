/**
 * DiDwa - Hubtel Mobile Money Service
 * Collections (Receive Money) + Instant Disbursements (Send Money).
 * https://developers.hubtel.com/
 *
 * DRY_RUN mode activates automatically when credentials are missing,
 * returning deterministic simulated results so the full payout and POS
 * flows remain demoable without live keys.
 */
import axios from 'axios';
import crypto from 'node:crypto';

const CLIENT_ID = process.env.HUBTEL_CLIENT_ID || '';
const CLIENT_SECRET = process.env.HUBTEL_CLIENT_SECRET || '';
const MERCHANT_ACCOUNT = process.env.HUBTEL_MERCHANT_ACCOUNT || '';
const BASE_URL = process.env.HUBTEL_BASE_URL || 'https://api-txn.hubtel.com';
const CALLBACK_URL = process.env.HUBTEL_CALLBACK_URL || '';

/** Vercel serverless functions hard-kill at their maxDuration (10s on Hobby),
 *  so live gateway calls must give up well before that or a stale request
 *  would 504 after money has already moved. */
const ON_VERCEL = Boolean(process.env.VERCEL);

export const hubtelDryRun = !(CLIENT_ID && CLIENT_SECRET && MERCHANT_ACCOUNT);

const http = axios.create({
  baseURL: BASE_URL,
  timeout: ON_VERCEL ? 8_000 : 25_000,
  auth: { username: CLIENT_ID, password: CLIENT_SECRET },
  headers: { 'Content-Type': 'application/json' },
});

/** Internal network label -> Hubtel channel identifier. */
const CHANNEL_MAP = {
  MTN: 'mtn-gh',
  VODAFONE: 'vodafone-gh',   // Telecel/Vodafone Ghana
  AT: 'airteltigo-gh',       // AT Money (AirtelTigo)
};
// Allow operators to override Hubtel channel codes without a code change.
if (process.env.HUBTEL_CHANNEL_MTN) CHANNEL_MAP.MTN = process.env.HUBTEL_CHANNEL_MTN;
if (process.env.HUBTEL_CHANNEL_VODAFONE) CHANNEL_MAP.VODAFONE = process.env.HUBTEL_CHANNEL_VODAFONE;
if (process.env.HUBTEL_CHANNEL_AT) CHANNEL_MAP.AT = process.env.HUBTEL_CHANNEL_AT;

export function channelFor(network) {
  return CHANNEL_MAP[String(network || '').toUpperCase()] || CHANNEL_MAP.MTN;
}

function dryReference(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

/** Hubtel marks success with HTTP 200/201 and Status=Success / ResponseCode=0000. */
function interpret(data) {
  const status = String(data?.Status || data?.status || '').toLowerCase();
  const code = String(data?.ResponseCode || data?.responseCode || '');
  const success = status === 'success' || code === '0000';
  return { success, code: code || null, message: data?.Message || data?.message || null, raw: data };
}

/* --------------------------- Collections (Receive) -------------------------- */

/**
 * Charge a customer's mobile money wallet (online checkout / POS MoMo).
 * amount is GHS. customerMsisdn: 233XXXXXXXXX.
 */
export async function collectMoMo({ customerMsisdn, amount, network, description = 'DiDwa purchase', clientReference }) {
  const payload = {
    CustomerMsisdn: customerMsisdn,
    Amount: Number(amount).toFixed(2),
    Channel: channelFor(network),
    Description: description,
    ClientReference: clientReference || `GS-${Date.now()}`,
    CallbackUrl: CALLBACK_URL || undefined,
    PrimaryCallbackUrl: CALLBACK_URL || undefined,
  };

  if (hubtelDryRun) {
    console.log(`[hubtel:DRY_RUN] COLLECT ${payload.Amount} GHS from ${customerMsisdn} (${payload.Channel})`);
    return {
      success: true,
      dryRun: true,
      reference: dryReference('COLLECT'),
      transactionId: dryReference('TX'),
      raw: { Status: 'Success', ResponseCode: '0000' },
    };
  }

  try {
    const { data } = await http.post(
      `/v1/merchantaccount/merchants/${encodeURIComponent(MERCHANT_ACCOUNT)}/receive/mobilemoney`,
      payload,
    );
    const result = interpret(data);
    return {
      success: result.success,
      reference: data?.Data?.ClientReference || payload.ClientReference,
      transactionId: data?.Data?.TransactionId || null,
      message: result.message,
      raw: result.raw,
    };
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('[hubtel] collect failed:', typeof detail === 'object' ? JSON.stringify(detail) : detail);
    return { success: false, message: 'Mobile money collection failed. Ask the customer to approve or retry.', raw: detail };
  }
}

/* ------------------------- Disbursements (Send) ---------------------------- */

/**
 * Instant MoMo payout to a seller's wallet (Module 3).
 * Returns { success, reference, transactionId, message }.
 */
export async function disburseMoMo({ destination, amount, network, description = 'DiDwa payout', clientReference }) {
  const payload = {
    Destination: destination,                 // 233XXXXXXXXX
    Amount: Number(amount).toFixed(2),
    Channel: channelFor(network),
    Description: description,
    ClientReference: clientReference || `GS-PAY-${Date.now()}`,
    CallbackUrl: CALLBACK_URL || undefined,
    PrimaryCallbackUrl: CALLBACK_URL || undefined,
  };

  if (hubtelDryRun) {
    console.log(`[hubtel:DRY_RUN] DISBURSE ${payload.Amount} GHS to ${destination} (${payload.Channel})`);
    return {
      success: true,
      dryRun: true,
      reference: dryReference('PAY'),
      transactionId: dryReference('TX'),
      raw: { Status: 'Success', ResponseCode: '0000' },
    };
  }

  try {
    const { data } = await http.post(
      `/v1/merchantaccount/merchants/${encodeURIComponent(MERCHANT_ACCOUNT)}/send/mobilemoney`,
      payload,
    );
    const result = interpret(data);
    return {
      success: result.success,
      reference: data?.Data?.ClientReference || payload.ClientReference,
      transactionId: data?.Data?.TransactionId || null,
      message: result.success ? null : (result.message || 'Disbursement declined by Hubtel.'),
      raw: result.raw,
    };
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('[hubtel] disbursement failed:', typeof detail === 'object' ? JSON.stringify(detail) : detail);
    return { success: false, message: 'Hubtel disbursement error. Payout queued for retry review.', raw: detail };
  }
}

export default { collectMoMo, disburseMoMo, channelFor, get dryRun() { return hubtelDryRun; } };
