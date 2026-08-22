import React, { useEffect, useState } from 'react';
import { Wallet, ArrowUpRight, Clock } from 'lucide-react';
import StatusBadge from '../components/UI/StatusBadge.jsx';
import { apiGet, apiPost } from '../lib/api.js';

const STATUS_MAP = {
  REQUESTED: 'pending',
  APPROVED: 'pending',
  PROCESSING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  REJECTED: 'failed',
};

/**
 * SellerPayouts — instant MoMo cashout portal. Requests below the
 * platform's risk threshold are auto-approved and disbursed by Hubtel
 * within seconds; larger requests queue for manual review.
 */
export default function SellerPayouts() {
  const [wallet, setWallet] = useState(null);
  const [history, setHistory] = useState([]);
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  function refresh() {
    apiGet('/payouts/balance').then(setWallet).catch(() => {});
    apiGet('/payouts/history').then(setHistory).catch(() => {});
  }

  useEffect(refresh, []);

  async function handleRequestPayout(e) {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const result = await apiPost('/payouts/request', { amount: Number(amount) });
      setFeedback({
        tone: 'success',
        message: result.autoApproved
          ? `GHS ${result.amount.toFixed(2)} is on its way to your Mobile Money wallet.`
          : `GHS ${result.amount.toFixed(2)} payout submitted for review.`,
      });
      setAmount('');
      refresh();
    } catch (err) {
      setFeedback({ tone: 'error', message: 'Could not submit payout request. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold text-slate-950">Payouts</h1>
        <p className="text-sm text-slate-500">Cash out instantly to Mobile Money — MTN, Telecel, or AT Money.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <BalanceTile icon={<Wallet size={18} className="text-success" />} label="Available"
          value={wallet?.availableBalance} tone="success" />
        <BalanceTile icon={<Clock size={18} className="text-warning" />} label="Pending"
          value={wallet?.pendingBalance} tone="warning" />
        <BalanceTile icon={<ArrowUpRight size={18} className="text-brand" />} label="Rider transit"
          value={wallet?.riderTransitBalance} tone="brand" />
      </div>

      <form onSubmit={handleRequestPayout} className="rounded-xl2 border border-slate-200 bg-white p-4">
        <label className="text-xs font-medium text-slate-500">Amount to cash out (GHS)</label>
        <div className="mt-2 flex gap-2">
          <input
            type="number"
            min="1"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums focus:border-brand focus:outline-none"
          />
          <button
            type="submit"
            disabled={isSubmitting || !amount}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Sending…' : 'Cash out'}
          </button>
        </div>
        {feedback && (
          <p className={`mt-2 text-xs ${feedback.tone === 'success' ? 'text-success' : 'text-danger'}`}>
            {feedback.message}
          </p>
        )}
      </form>

      <div className="rounded-xl2 border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-950">Payout history</h2>
        <ul className="divide-y divide-slate-100">
          {history.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-950 tabular-nums">GHS {Number(p.amount).toFixed(2)}</p>
                <p className="text-xs text-slate-500">{p.momo_network} · {new Date(p.requested_at).toLocaleDateString('en-GB')}</p>
              </div>
              <StatusBadge status={STATUS_MAP[p.status] || 'pending'} label={p.status} />
            </li>
          ))}
          {history.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-400">No payouts yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function BalanceTile({ icon, label, value, tone }) {
  const bg = { success: 'bg-success-50', warning: 'bg-warning-50', brand: 'bg-brand-50' }[tone];
  return (
    <div className="rounded-xl2 border border-slate-200 bg-white p-4">
      <div className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg ${bg}`}>{icon}</div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold text-slate-950 tabular-nums">GHS {(value ?? 0).toFixed(2)}</p>
    </div>
  );
}
