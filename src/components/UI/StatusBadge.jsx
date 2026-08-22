import React from 'react';

/**
 * StatusBadge — a single standardized pill used everywhere a store,
 * order, payout, or stock status needs a visual indicator.
 * No emojis, ever: each variant ships its own tiny inline SVG glyph.
 */
const VARIANTS = {
  active: {
    label: 'Active',
    classes: 'bg-success-50 text-success border border-emerald-200',
    dot: '#059669',
  },
  paid: {
    label: 'Paid',
    classes: 'bg-success-50 text-success border border-emerald-200',
    dot: '#059669',
  },
  trialing: {
    label: 'Trial',
    classes: 'bg-brand-50 text-brand-700 border border-blue-200',
    dot: '#2563EB',
  },
  pending: {
    label: 'Pending',
    classes: 'bg-warning-50 text-warning border border-amber-200',
    dot: '#F59E0B',
  },
  low_stock: {
    label: 'Low stock',
    classes: 'bg-warning-50 text-warning border border-amber-200',
    dot: '#F59E0B',
  },
  past_due: {
    label: 'Past due',
    classes: 'bg-warning-50 text-warning border border-amber-200',
    dot: '#F59E0B',
  },
  suspended: {
    label: 'Suspended',
    classes: 'bg-danger-50 text-danger border border-red-200',
    dot: '#EF4444',
  },
  out_of_stock: {
    label: 'Out of stock',
    classes: 'bg-danger-50 text-danger border border-red-200',
    dot: '#EF4444',
  },
  failed: {
    label: 'Failed',
    classes: 'bg-danger-50 text-danger border border-red-200',
    dot: '#EF4444',
  },
};

export default function StatusBadge({ status, label }) {
  const variant = VARIANTS[status] || VARIANTS.pending;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${variant.classes}`}
    >
      <svg width="6" height="6" viewBox="0 0 6 6" fill="none" aria-hidden="true">
        <circle cx="3" cy="3" r="3" fill={variant.dot} />
      </svg>
      {label || variant.label}
    </span>
  );
}
