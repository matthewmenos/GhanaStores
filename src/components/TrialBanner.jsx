import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const TRIAL_LENGTH_DAYS = 14;

/**
 * TrialBanner — persistent countdown shown at the top of the seller
 * dashboard while a store is TRIALING or PAST_DUE. Fetches live status
 * from /api/billing/status so the countdown ring stays accurate even
 * as the backend cron advances the store through its lifecycle.
 */
export default function TrialBanner({ apiBase = '/api', authToken, onDismiss }) {
  const [billing, setBilling] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiBase}/billing/status`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => r.json())
      .then((data) => !cancelled && setBilling(data))
      .catch(() => {});
    return () => { cancelled = true; };
  }, [apiBase, authToken]);

  if (!billing || dismissed || billing.status === 'ACTIVE') return null;

  const isPastDue = billing.status === 'PAST_DUE';
  const isSuspended = billing.status === 'SUSPENDED';
  const progress = Math.max(0, Math.min(1, billing.daysRemaining / TRIAL_LENGTH_DAYS));
  const circumference = 2 * Math.PI * 15;
  const dashOffset = circumference * (1 - progress);

  const tone = isSuspended
    ? { bg: 'bg-danger-50', border: 'border-red-200', text: 'text-danger', ring: '#EF4444' }
    : isPastDue
      ? { bg: 'bg-warning-50', border: 'border-amber-200', text: 'text-warning', ring: '#F59E0B' }
      : { bg: 'bg-brand-50', border: 'border-blue-200', text: 'text-brand-700', ring: '#2563EB' };

  return (
    <div className={`flex items-center justify-between gap-4 border ${tone.border} ${tone.bg} px-4 py-3`}>
      <div className="flex items-center gap-3">
        <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
          <circle cx="18" cy="18" r="15" fill="none" stroke="#E2E8F0" strokeWidth="3" />
          <circle
            cx="18" cy="18" r="15" fill="none"
            stroke={tone.ring} strokeWidth="3" strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 18 18)"
          />
          <text x="18" y="21" textAnchor="middle" fontSize="10" fontWeight="600" fill={tone.ring}>
            {billing.daysRemaining}
          </text>
        </svg>

        <div>
          <p className={`text-sm font-semibold ${tone.text}`}>
            {isSuspended
              ? 'Your storefront is suspended'
              : isPastDue
                ? 'Your subscription is past due'
                : `${billing.daysRemaining} day${billing.daysRemaining === 1 ? '' : 's'} left in your free trial`}
          </p>
          <p className="text-xs text-slate-600">
            {isSuspended
              ? 'Renew now to bring your storefront back online.'
              : isPastDue
                ? `Renew before ${new Date(billing.graceEndsAt).toLocaleDateString('en-GB')} to avoid suspension.`
                : `Trial ends ${new Date(billing.trialEndsAt).toLocaleDateString('en-GB')}. Renew anytime to keep selling without interruption.`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <a
          href="/billing/renew"
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          Renew subscription
        </a>
        {!isSuspended && (
          <button
            aria-label="Dismiss"
            onClick={() => { setDismissed(true); onDismiss?.(); }}
            className="p-1 text-slate-400 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
