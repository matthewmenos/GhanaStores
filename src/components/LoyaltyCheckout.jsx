import React, { useMemo, useState } from 'react';
import { Award, Sparkles } from 'lucide-react';

/**
 * LoyaltyCheckout — lets a returning buyer apply their accumulated
 * loyalty points as a discount at checkout. Purely presentational /
 * controlled: the parent checkout flow owns the actual order total and
 * passes back the buyer's chosen redemption via onApply.
 */
export default function LoyaltyCheckout({
  availablePoints = 0,
  ghsValuePerPoint = 0.05,
  orderSubtotal = 0,
  onApply,
}) {
  const [pointsToRedeem, setPointsToRedeem] = useState(0);

  const maxRedeemable = useMemo(() => {
    const maxByPoints = availablePoints;
    const maxByOrderValue = Math.floor(orderSubtotal / ghsValuePerPoint);
    return Math.max(0, Math.min(maxByPoints, maxByOrderValue));
  }, [availablePoints, orderSubtotal, ghsValuePerPoint]);

  const discountGhs = pointsToRedeem * ghsValuePerPoint;

  function handleSlide(e) {
    const value = Number(e.target.value);
    setPointsToRedeem(value);
    onApply?.({ pointsRedeemed: value, discountGhs: value * ghsValuePerPoint });
  }

  if (availablePoints <= 0) return null;

  return (
    <div className="rounded-xl2 border border-amber-200 bg-warning-50 p-4">
      <div className="flex items-center gap-2">
        <Award size={18} className="text-warning" />
        <p className="text-sm font-semibold text-slate-950">
          You have {availablePoints.toLocaleString()} loyalty points
        </p>
      </div>
      <p className="mt-1 text-xs text-slate-600">
        Worth up to GHS {(availablePoints * ghsValuePerPoint).toFixed(2)} — redeem some now.
      </p>

      <div className="mt-3">
        <input
          type="range"
          min={0}
          max={maxRedeemable}
          step={1}
          value={pointsToRedeem}
          onChange={handleSlide}
          className="w-full accent-[#F59E0B]"
          aria-label="Points to redeem"
        />
        <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
          <span>0 pts</span>
          <span className="flex items-center gap-1 font-medium text-slate-950">
            <Sparkles size={12} className="text-warning" />
            {pointsToRedeem} pts applied · -GHS {discountGhs.toFixed(2)}
          </span>
          <span>{maxRedeemable} pts</span>
        </div>
      </div>
    </div>
  );
}
