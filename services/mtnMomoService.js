/**
 * DiDwa - MTN Mobile Money API Service (primary provider for MTN numbers)
 * Collections + Disbursements with async status polling.
 * https://momodeveloper.mtn.com/
 *
 * Routing (see routes/paymentRouter.js):
 *   MTN numbers    -> MTN MoMo API first, Hubtel once on failure/timeout.
 *   Telecel/AT     -> Hubtel directly (fallback provider).
 *
 * Env: MTN_MOMO_BASE_URL, MTN_MOMO_SUBSCRIPTION_KEY,
 *   MTN_MOMO_COLLECTION_USER_ID, MTN_MOMO_COLLECTION_API_KEY,
 *   MTN_MOMO_DISBURSEMENT_USER_ID, MTN_MOMO_DISBURSEMENT_API_KEY
 *   (default to the collection user), MTN_MOMO_TARGET_ENVIRONMENT
 *   (`sandbox` | `mtn-ghana`), MTN_MOMO_PARTY_ID_TYPE, MTN_MOMO_CURRENCY,
 *   MTN_MOMO_TIMEOUT_MS, MTN_MOMO_POLL_ATTEMPTS,
 *   MTN_MOMO_POLL_INTERVAL_MS, MTN_MOMO_CALLBACK_URL.
 */
import axios from 'axios';
import crypto from 'node:crypto';

const BASE_URL = (process.env.MTN_MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com')
  .replace(/\/+$/, '');
const SUBSCRIPTION_KEY = process.env.MTN_MOMO_SUBSCRIPTION_KEY || '';
const COLLECTION_USER_ID = process.env.MTN_MOMO_COLLECTION_USER_ID || '';
const COLLECTION_API_KEY = process.env.MTN_MOMO_COLLECTION_API_KEY || '';
const DISBURSEMENT_USER_ID = process.env.MTN_MOMO_DISBURSEMENT_USER_ID || COLLECTION_USER_ID;
const DISBURSEMENT_API_KEY = process.env.MTN_MOMO_DISBURSEMENT_API_KEY || COLLECTION_API_KEY;
const TARGET_ENV = process.env.MTN_MOMO_TARGET_ENVIRONMENT || 'sandbox';
const PARTY_ID_TYPE = process.env.MTN_MOMO_PARTY_ID_TYPE || 'MSISDN';
const CURRENCY = (process.env.MTN_MOMO_CURRENCY || 'GHS').toUpperCase();
const CALLBACK_URL = process.env.MTN_MOMO_CALLBACK_URL || '';

/** Keep attempts inside serverless time budgets (Vercel Hobby ~10s). */
const ON_VERCEL = Boolean(process.env.VERCEL);
const TIMEOUT_MS = Number(process.env.MTN_MOMO_TIMEOUT_MS || (ON_VERCEL ? 8_000 : 20_000));
const POLL_ATTEMPTS = Number(process.env.MTN_MOMO_POLL_ATTEMPTS || (ON_VERCEL ? 3 : 6));
const POLL_INTERVAL_MS = Number(process.env.MTN_MOMO_POLL_INTERVAL_MS || 2_000);

export const mtnDryRun = !(SUBSCRIPTION_KEY && COLLECTION_USER_ID && COLLECTION_API_KEY);

const http = axios.create({ baseURL: BASE_URL, timeout: TIMEOUT_MS });

/* Short-lived OAuth tokens per product, refreshed a minute before expiry. */
const tokenCache = { collection: null, disbursement: null };

async function fetchToken(kind) {
  const userId = kind === 'disbursement' ? DISBURSEMENT_USER_ID : COLLECTION_USER_ID;
  const apiKey = kind === 'disbursement' ? DISBURSEMENT_API_KEY : COLLECTION_API_KEY;
  const { data } = await http.post(`/${kind}/token/`, {}, {
    headers: { 'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY, 'Content-Type': 'application/json' },
    auth: { username: userId, password: apiKey },
  });
  const ttl = Number(data?.expires_in || 3600);
  tokenCache[kind] = {
    token: data?.access_token || '',
    expiresAt: Date.now() + Math.max(30_000, (ttl - 60) * 1000),
  };
  return tokenCache[kind].token;
}

async function bearerToken(kind) {
  const cached = tokenCache[kind];
  if (cached?.token && Date.now() < cached.expiresAt) return cached.token;
  return fetchToken(kind);
}

function mtnHeaders(token, reference) {
  return {
    Authorization: `Bearer ${token}`,
    'X-Reference-Id': reference,
    'X-Target-Environment': TARGET_ENV,
    'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
    'Content-Type': 'application/json',
    ...(CALLBACK_URL ? { 'Callback-Url': CALLBACK_URL } : {}),
  };
}

const newReference = () => crypto.randomUUID();

/* Status polling: requestToPay/transfer are async on MTN's side - HTTP 202
 * only means "received". SUCCESSFUL vs FAILED/REJECTED/TIMEOUT/EXPIRED are
 * the terminal states reported by the transaction-status endpoints. */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollStatus(kind, reference) {
  const path = kind === 'disbursement'
    ? `/disbursement/v1_0/transfer/${reference}`
    : `/collection/v1_0/requesttopay/${reference}`;
  let last = null;
  for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
    try {
      const token = await bearerToken(kind);
      const headers = {
        Authorization: `Bearer ${token}`,
        'X-Target-Environment': TARGET_ENV,
        'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
      };
      const { data } = await http.get(path, { headers });
      last = data;
      const status = String(data?.status || '').toUpperCase();
      if (status === 'SUCCESSFUL') return { final: true, success: true, status, raw: data };
      if (['FAILED', 'REJECTED', 'TIMEOUT', 'EXPIRED'].includes(status)) {
        return {
          final: true, success: false, status,
          message: data?.reason?.message || data?.message || `MTN transaction ${status.toLowerCase()}.`,
          raw: data,
        };
      }
    } catch (err) {
      const httpStatus = err.response?.status;
      // 404/202 while the transaction propagates = "not final yet".
      if (httpStatus && ![404, 202].includes(httpStatus) && httpStatus < 500) {
        return { final: false, success: false, message: err.message, raw: err.response?.data };
      }
      last = err.response?.data ?? null;
    }
    if (attempt < POLL_ATTEMPTS) await sleep(POLL_INTERVAL_MS);
  }
  return {
    final: false, success: false, status: 'PENDING',
    message: 'MTN transaction still pending; Hubtel fallback may proceed.', raw: last,
  };
}

function dryResult(verb, amount, counterparty) {
  console.log(`[mtn:DRY_RUN] ${verb} ${Number(amount).toFixed(2)} GHS ${counterparty}`);
  return {
    success: true, dryRun: true, provider: 'MTN', reference: newReference(),
    transactionId: `TX-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    status: 'SUCCESSFUL', raw: { status: 'SUCCESSFUL' },
  };
}

/**
 * Charge a customer's MTN wallet (requestToPay). amount is GHS.
 * customerMsisdn: 233XXXXXXXXX. clientReference doubles as the MTN
 * X-Reference-Id for idempotency across retries.
 */
export async function mtnCollect({ customerMsisdn, amount, description = 'DiDwa purchase', clientReference }) {
  const reference = clientReference || newReference();
  if (mtnDryRun) return dryResult('COLLECT', amount, `from ${customerMsisdn}`);

  const payload = {
    amount: Number(amount).toFixed(2),
    currency: CURRENCY,
    externalId: reference,
    payer: { partyIdType: PARTY_ID_TYPE, partyId: String(customerMsisdn) },
    payerMessage: String(description).slice(0, 160),
    payeeNote: String(description).slice(0, 160),
  };

  try {
    await http.post('/collection/v1_0/requesttopay', payload,
      { headers: mtnHeaders(await bearerToken('collection'), reference) });
    const polled = await pollStatus('collection', reference);
    if (polled.final && polled.success) {
      return { success: true, provider: 'MTN', reference, transactionId: reference, status: 'SUCCESSFUL', raw: polled.raw };
    }
    return {
      success: false, provider: 'MTN', reference, status: polled.status || 'UNKNOWN',
      message: polled.message || 'MTN collection was not approved.',
      pending: !polled.final, raw: polled.raw,
    };
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('[mtn] collect failed:', typeof detail === 'object' ? JSON.stringify(detail) : detail);
    return {
      success: false, provider: 'MTN', reference, status: 'ERROR',
      message: 'MTN collection error. Fallback provider may be tried.', raw: detail,
    };
  }
}

/**
 * Pay out to a seller MTN wallet (transfer). destination: 233XXXXXXXXX.
 */
export async function mtnDisburse({ destination, amount, description = 'DiDwa payout', clientReference }) {
  const reference = clientReference || newReference();
  if (mtnDryRun) return dryResult('DISBURSE', amount, `to ${destination}`);

  const payload = {
    amount: Number(amount).toFixed(2),
    currency: CURRENCY,
    externalId: reference,
    payee: { partyIdType: PARTY_ID_TYPE, partyId: String(destination) },
    payerMessage: String(description).slice(0, 160),
    payeeNote: String(description).slice(0, 160),
  };

  try {
    await http.post('/disbursement/v1_0/transfer', payload,
      { headers: mtnHeaders(await bearerToken('disbursement'), reference) });
    const polled = await pollStatus('disbursement', reference);
    if (polled.final && polled.success) {
      return { success: true, provider: 'MTN', reference, transactionId: reference, status: 'SUCCESSFUL', raw: polled.raw };
    }
    return {
      success: false, provider: 'MTN', reference, status: polled.status || 'UNKNOWN',
      message: polled.message || 'MTN disbursement was not completed.',
      pending: !polled.final, raw: polled.raw,
    };
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('[mtn] disbursement failed:', typeof detail === 'object' ? JSON.stringify(detail) : detail);
    return {
      success: false, provider: 'MTN', reference, status: 'ERROR',
      message: 'MTN disbursement error. Fallback provider may be tried.', raw: detail,
    };
  }
}

export default { mtnCollect, mtnDisburse, get dryRun() { return mtnDryRun; } };
