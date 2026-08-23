/**
 * Loyalty math shared by POS checkout, LoyaltyCheckout widget and analytics.
 * Mirrors utils/helpers.js on the API so client previews match server truth.
 */

/** Default: 1 point is worth GHS 0.05 (20 points = GHS 1). */
export const DEFAULT_POINT_VALUE = 0.05;

/** GHS value of a points balance. */
export function redeemValue(points, pointValue = DEFAULT_POINT_VALUE) {
  const n = Math.max(0, Number(points) || 0);
  const v = Math.max(0, Number(pointValue) || DEFAULT_POINT_VALUE);
  return Math.round(n * v * 100) / 100;
}

/** Points earned for a GHS spend (e.g. 10 points per GHS 1). */
export function pointsForSpend(totalGhs, pointsPerGhs = 1) {
  const t = Math.max(0, Number(totalGhs) || 0);
  const r = Math.max(0, Number(pointsPerGhs) || 0);
  return Math.floor(t * r);
}

/** Max points a customer can apply against a cart subtotal. */
export function maxRedeemablePoints(subtotalGhs, pointBalance, pointValue = DEFAULT_POINT_VALUE) {
  const valueCap = Math.max(0, Number(subtotalGhs) || 0);
  const pointsForValue = Math.floor(valueCap / (Number(pointValue) || DEFAULT_POINT_VALUE));
  return Math.max(0, Math.min(pointsForValue, Math.max(0, Number(pointBalance) || 0)));
}
