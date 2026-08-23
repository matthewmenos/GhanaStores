/**
 * Loyalty point redemption widget (Module 2).
 * Looks up a customer by phone, shows their SVG star-badge balance and lets
 * the seller slide how many points to redeem; reports the GHS discount up.
 */
import { useState, useEffect } from 'react';
import { api, ghs } from '../api.js';
import { IconStar, IconSpinner, IconSearch } from './icons.jsx';

function PointsBadge({ points }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-bold">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#F59E0B" aria-hidden="true">
        <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1L12 2z" />
      </svg>
      {points.toLocaleString()} pts
    </span>
  );
}

export default function LoyaltyCheckout({ phone, onRedeemChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [redeem, setRedeem] = useState(0);

  useEffect(() => {
    setData(null);
    setRedeem(0);
    onRedeemChange?.(0);
    if (!phone || phone.length < 9) return;

    let live = true;
    setLoading(true);
    api.get(`/api/pos/loyalty/${encodeURIComponent(phone)}`)
      .then((res) => { if (live) setData(res); })
      .catch(() => { if (live) setData(null); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [phone]); // eslint-disable-line react-hooks/exhaustive-deps

  const customer = data?.customer;
  const maxPoints = customer?.loyalty_points || 0;
  const pointValue = data?.pointValueGhs ?? 0.05;
  const discount = redeem * pointValue;

  function update(v) {
    const clamped = Math.max(0, Math.min(Math.floor(v), maxPoints));
    setRedeem(clamped);
    onRedeemChange?.(clamped);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-700">
          <IconStar size={16} className="text-amber-500" />
          <span className="text-sm font-semibold">Loyalty</span>
        </div>
        {loading && <IconSpinner size={16} className="text-slate-400" />}
        {!loading && customer && <PointsBadge points={customer.loyalty_points} />}
      </div>

      {!phone || phone.length < 9 ? (
        <p className="mt-2 text-xs text-slate-400 flex items-center gap-1.5">
          <IconSearch size={13} /> Enter the customer phone to load points.
        </p>
      ) : !customer ? (
        !loading && (
          <p className="mt-2 text-xs text-slate-500">
            New customer - points are earned automatically after this sale.
          </p>
        )
      ) : (
        <>
          {maxPoints > 0 ? (
            <>
              <input
                type="range"
                min={0}
                max={maxPoints}
                value={redeem}
                onChange={(e) => update(Number(e.target.value))}
                className="w-full mt-3 accent-amber-500"
              />
              <div className="flex items-center justify-between mt-1.5 text-xs">
                <span className="text-slate-500">
                  Redeem <strong className="text-charcoal">{redeem}</strong> pts
                  <span className="text-slate-400"> / {maxPoints.toLocaleString()}</span>
                </span>
                <span className={`font-bold ${discount > 0 ? 'text-emerald-brand' : 'text-slate-400'}`}>
                  - {ghs(discount)}
                </span>
              </div>
            </>
          ) : (
            <p className="mt-2 text-xs text-slate-400">No points available yet.</p>
          )}
        </>
      )}
    </div>
  );
}
