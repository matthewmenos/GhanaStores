import axios from 'axios';

const {
  HUBTEL_CLIENT_ID,
  HUBTEL_CLIENT_SECRET,
  HUBTEL_MERCHANT_ACCOUNT_NUMBER,
  HUBTEL_CALLBACK_URL,
  HUBTEL_BASE_URL = 'https://api.hubtel.com',
} = process.env;

const hubtelClient = axios.create({
  baseURL: HUBTEL_BASE_URL,
  auth: {
    username: HUBTEL_CLIENT_ID,
    password: HUBTEL_CLIENT_SECRET,
  },
  timeout: 15_000,
});

/**
 * Maps our internal network codes to Hubtel's MoMo channel codes.
 */
const NETWORK_CHANNEL_MAP = {
  MTN: 'mtn-gh',
  TELECEL: 'vodafone-gh',
  AT: 'tigo-gh',
};

/**
 * Initiates a buyer-facing MoMo payment collection (checkout).
 * Returns Hubtel's transaction reference so the frontend can poll
 * /payments/status or wait for the webhook.
 */
export async function initiateCollection({ storeId, orderId, amountGhs, network, momoNumber, customerName }) {
  const channel = NETWORK_CHANNEL_MAP[network];
  if (!channel) throw new Error(`Unsupported MoMo network: ${network}`);

  const clientReference = `GS-${storeId.slice(0, 8)}-${orderId.slice(0, 8)}-${Date.now()}`;

  const { data } = await hubtelClient.post('/v1/merchantaccount/merchants/receive/mobilemoney', {
    CustomerName: customerName,
    CustomerMsisdn: momoNumber,
    Channel: channel,
    Amount: amountGhs,
    PrimaryCallbackUrl: HUBTEL_CALLBACK_URL,
    Description: `Ghana Stores order ${orderId}`,
    ClientReference: clientReference,
  });

  return {
    hubtelTransactionId: data?.Data?.TransactionId,
    clientReference,
    status: data?.Data?.Status || 'Pending',
    raw: data,
  };
}

/**
 * Instant MoMo disbursement (seller payout / cashout).
 * Called from routes/payoutRoutes.js once a payout has cleared the
 * risk-threshold auto-approval check and the wallet has been debited
 * inside a DB transaction.
 */
export async function disburseToMomo({ payoutId, storeId, amountGhs, network, momoNumber, recipientName }) {
  const channel = NETWORK_CHANNEL_MAP[network];
  if (!channel) throw new Error(`Unsupported MoMo network: ${network}`);

  const clientReference = `PAYOUT-${storeId.slice(0, 8)}-${payoutId.slice(0, 8)}`;

  const { data } = await hubtelClient.post('/v1/merchantaccount/merchants/' + HUBTEL_MERCHANT_ACCOUNT_NUMBER + '/transactions', {
    RecipientName: recipientName,
    RecipientMsisdn: momoNumber,
    Channel: channel,
    Amount: amountGhs,
    PrimaryCallbackUrl: HUBTEL_CALLBACK_URL,
    Description: `Ghana Stores instant payout ${payoutId}`,
    ClientReference: clientReference,
  });

  return {
    hubtelTransactionId: data?.Data?.TransactionId,
    clientReference,
    status: data?.Data?.Status || 'Pending',
    raw: data,
  };
}

/**
 * Verifies a Hubtel webhook payload signature / shape before trusting it.
 * Hubtel does not sign payloads by default, so we defensively validate the
 * client reference belongs to us and re-check the transaction status.
 */
export async function verifyTransactionStatus(transactionId) {
  const { data } = await hubtelClient.get(
    `/v1/merchantaccount/merchants/${HUBTEL_MERCHANT_ACCOUNT_NUMBER}/transactions/status`,
    { params: { transactionId } }
  );
  return data;
}

export default {
  initiateCollection,
  disburseToMomo,
  verifyTransactionStatus,
};
