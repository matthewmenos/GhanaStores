/**
 * Trial countdown banner with an SVG timer ring.
 * Amber during TRIAL / PAST_DUE (grace), crimson once SUSPENDED.
 */
import { IconTimer, IconAlert, IconCheck } from './icons.jsx';
import { api } from '../api.js';

function TimerRing({ pct, color }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r={r} fill="none" stroke="currentColor" strokeWidth="3.5" opacity="0.25" />
      <circle
        cx="20" cy="20" r={r} fill="none" stroke="currentColor" strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(1, pct)))}
        transform="rotate(-90 20 20)"
        style={{ transition: 'stroke-dashoffset .6s ease' }}
      />
      <path d="M20 12v8l5 3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}

export default function TrialBanner({ billing, onActivated }) {
  if (!billing || billing.status === 'ACTIVE') return null;

  const daysLeft = Number(billing.days_left ?? 0);
  const pct = Math.max(0, Math.min(1, daysLeft / 14));
  const suspended = billing.status === 'SUSPENDED';
  const pastDue = billing.status === 'PAST_DUE';

  const tone = suspended
    ? 'bg-red-600 text-white'
    : 'bg-amber-50 text-amber-900 border border-amber-200';

  const ends = billing.trial_ends_at
    ? new Date(billing.trial_ends_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  async function activate() {
    try {
      await api.post('/api/billing/activate', { planId: 'growth' });
      onActivated?.();
    } catch { /* surfaced by caller toast */ }
  }

  return (
    <div className={`flex items-center gap-4 rounded-xl px-4 py-3 ${tone}`}>
      <div className="shrink-0">
        {suspended
          ? <IconAlert size={30} className="text-white" />
          : (
            <div className={suspended ? 'text-white' : 'text-amber-600'}>
              <TimerRing pct={pct} />
            </div>
          )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight">
          {suspended && 'Store suspended - subscription required to reopen.'}
          {pastDue && `Trial ended. Grace period active - reactivate before ${ends}.`}
          {!suspended && !pastDue && (
            <>
              Free trial: <strong>{daysLeft <= 0 ? 'ending today' : `${Math.ceil(daysLeft)} day${Math.ceil(daysLeft) === 1 ? '' : 's'} left`}</strong>
              <span className="font-normal opacity-80"> (expires {ends})</span>
            </>
          )}
        </p>
        <p className="text-xs opacity-75 mt-0.5">
          Choose a plan to keep your storefront, payouts and SMS alerts running.
        </p>
      </div>

      <button
        onClick={activate}
        className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 transition"
      >
        {suspended || pastDue ? <IconCheck size={16} /> : <IconTimer size={16} />}
        Activate Plan
      </button>
    </div>
  );
}
