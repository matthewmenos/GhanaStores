/**
 * Standardized SVG status badges - one visual language across the whole PWA.
 * Pure inline SVG (dot + ring), zero emojis.
 */
const STYLES = {
  TRIAL: { fg: 'text-amber-700', bg: 'bg-amber-50', ring: 'stroke-amber-500', dot: '#F59E0B', label: 'Free Trial' },
  ACTIVE: { fg: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'stroke-emerald-600', dot: '#059669', label: 'Active' },
  PAST_DUE: { fg: 'text-amber-700', bg: 'bg-amber-50', ring: 'stroke-amber-500', dot: '#F59E0B', label: 'Past Due' },
  SUSPENDED: { fg: 'text-red-700', bg: 'bg-red-50', ring: 'stroke-red-500', dot: '#EF4444', label: 'Suspended' },
  PAID: { fg: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'stroke-emerald-600', dot: '#059669', label: 'Paid' },
  FULFILLED: { fg: 'text-blue-700', bg: 'bg-blue-50', ring: 'stroke-blue-600', dot: '#2563EB', label: 'Fulfilled' },
  DELIVERED: { fg: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'stroke-emerald-600', dot: '#059669', label: 'Delivered' },
  PENDING: { fg: 'text-amber-700', bg: 'bg-amber-50', ring: 'stroke-amber-500', dot: '#F59E0B', label: 'Pending' },
  PENDING_REVIEW: { fg: 'text-amber-700', bg: 'bg-amber-50', ring: 'stroke-amber-500', dot: '#F59E0B', label: 'In Review' },
  APPROVED: { fg: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'stroke-emerald-600', dot: '#059669', label: 'Approved' },
  FAILED: { fg: 'text-red-700', bg: 'bg-red-50', ring: 'stroke-red-500', dot: '#EF4444', label: 'Failed' },
  RECONCILED: { fg: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'stroke-emerald-600', dot: '#059669', label: 'Reconciled' },
  TRANSIT: { fg: 'text-amber-700', bg: 'bg-amber-50', ring: 'stroke-amber-500', dot: '#F59E0B', label: 'In Transit' },
  CANCELLED: { fg: 'text-red-700', bg: 'bg-red-50', ring: 'stroke-red-500', dot: '#EF4444', label: 'Cancelled' },
};

const FALLBACK = { fg: 'text-slate-600', bg: 'bg-slate-100', ring: 'stroke-slate-400', dot: '#94A3B8' };

export default function StatusBadge({ status, size = 'md' }) {
  const s = STYLES[String(status || '').toUpperCase()] || FALLBACK;
  const pad = size === 'sm'
    ? 'px-2 py-0.5 text-[10px]'
    : 'px-2.5 py-1 text-xs';
  const dotR = size === 'sm' ? 3 : 3.5;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${s.bg} ${s.fg} ${pad}`}>
      <svg width={dotR * 4} height={dotR * 4} viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="7" cy="7" r={dotR + 1.5} fill="none" strokeWidth="1.5" className={s.ring} opacity="0.35" />
        <circle cx="7" cy="7" r={dotR} fill={s.dot} />
      </svg>
      {s.label || status}
    </span>
  );
}

export function StatusBadgeStyles() { return STYLES; }
