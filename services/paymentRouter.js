/**
 * DiDwa - 2-Way Payment Router (MTN MoMo primary, Hubtel fallback)
 *
 * Routing rule (approved scope):
 *   - MTN numbers (024/025/053/054/055/059) -> MTN MoMo API first.
 *   - Telecel/Vodafone + AT numbers         -> Hubtel directly.
 *   - MTN failure / error / timeout / still-pending after polling ->
 *     exactly ONE Hubtel retry, with a distinct fallback reference.
 *   - Non-MTN failures return the Hubtel result as-is (no reverse retry).
 *
 * Both legs honor the services' own dry-run modes, so local development
 * works without gateway keys. Every result carries `provider` ('MTN' |
 * 'HUBTEL') and `fallback: true` when the Hubtel retry leg was used, so
 * callers can persist which provider moved the money.
 */
import { mtnCollect, mtnDisburse } from './mtnMomoService.js';
import { collectMoMo, disburseMoMo } from './hubtelService.js';

/* MTN Ghana MSISDN prefixes after normalization (233XXXXXXXXX). */
const MTN_PREFIXES = ['24', '25', '53', '54', '55', '59'];

const ALLOW_FALLBACK = String(process.env.PAYMENT_FALLBACK_ENABLED ?? 'true').toLowerCase() !== 'false';

/** True when a normalized 233XXXXXXXXX number belongs to MTN Ghana. */
export function isMtnNumber(msisdn) {
  let digits = String(msisdn || '').replace(/\D/g, '');
  // Accept local (0XXXXXXXXX), national (XXXXXXXXX), and 233XXXXXXXXX forms.
  if (digits.length === 10 && digits.startsWith('0')) digits = digits.slice(1);
  const local = digits.startsWith('233') ? digits.slice(3) : digits;
  return local.length === 9 && MTN_PREFIXES.includes(local.slice(0, 2));
}

function tag(result, provider, extra = {}) {
  return { ...result, provider, ...extra };
}

/**
 * Charge a customer wallet. Uses MTN API for MTN numbers, Hubtel otherwise.
 * @returns {Promise<{success, provider, fallback?, reference, ...}>}
 */
export async function routeCollection(args) {
  const msisdn = args?.customerMsisdn;
  if (!isMtnNumber(msisdn)) {
    return tag(await collectMoMo(args), 'HUBTEL', { fallback: false });
  }
  const first = await mtnCollect(args);
  if (first.success || !ALLOW_FALLBACK) return tag(first, 'MTN', { fallback: false });
  console.warn(`[payments] MTN collect ${first.status || 'failed'} for ${msisdn} - retrying once via Hubtel.`);
  const retry = await collectMoMo({
    ...args,
    clientReference: `${args.clientReference || first.reference || 'GS'}-HB`,
  });
  return tag(retry, 'HUBTEL', { fallback: true, mtnStatus: first.status || null });
}

/**
 * Instant payout to a seller wallet. Uses MTN API for MTN destinations,
 * Hubtel otherwise, with one Hubtel retry when the MTN leg fails.
 * @returns {Promise<{success, provider, fallback?, reference, ...}>}
 */
export async function routeDisbursement(args) {
  const destination = args?.destination;
  if (!isMtnNumber(destination)) {
    return tag(await disburseMoMo(args), 'HUBTEL', { fallback: false });
  }
  const first = await mtnDisburse(args);
  if (first.success || !ALLOW_FALLBACK) return tag(first, 'MTN', { fallback: false });
  console.warn(`[payments] MTN disburse ${first.status || 'failed'} for ${destination} - retrying once via Hubtel.`);
  const retry = await disburseMoMo({
    ...args,
    clientReference: `${args.clientReference || first.reference || 'GS-PAY'}-HB`,
  });
  return tag(retry, 'HUBTEL', { fallback: true, mtnStatus: first.status || null });
}

export default { isMtnNumber, routeCollection, routeDisbursement };
