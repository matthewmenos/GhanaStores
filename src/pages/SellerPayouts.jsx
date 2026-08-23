/**
 * Instant Seller Payouts portal (Module 3).
 * Wallet split (available / pending), instant Hubtel MoMo cashout under the
 * risk threshold, payout history with standardized SVG status badges.
 */
import { useEffect, useState } from 'react';
import { api, ghs } from '../api.js';
import StatusBadge from '../components/UI/StatusBadge.jsx';
import {
  IconWallet, IconPhonePay, IconSpinner, IconCheck,
  IconAlert, IconClock, IconShield, IconCoins,
} from '../components/icons.jsx';

const NETWORKS = ['MTN', 'VODAFONE', 'AT'];

function WalletCashout() {
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [amount, setAmount] = useState('');
  const [network, setNetwork] = useState('MTN');
  const [destination, setDestination] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  async function load() {
    try {
      const [s, h] = await Promise.all([
        api.get('/api/payouts/summary'),
        api.get('/api/payouts/history'),
      ]);
      setSummary(s);
      setHistory(h.payouts || []);
      if (!destination && s.wallet?.momo_number) setDestination(s.wallet.momo_number);
    } catch (e) {
      setFeedback({ ok: false, msg: e.message });
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function requestPayout(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const d = await api.post('/api/payouts/request', {
        amount: Number(amount),
        network,
        destination,
      });
      setFeedback({ ok: true, msg: d.message, dryRun: d.dryRun });
      setAmount('');
      await load();
    } catch (err) {
      setFeedback({ ok: false, msg: err.message });
    } finally {
      setBusy(false);
    }
  }

  const wallet = summary?.wallet;
  const available = Number(wallet?.available_balance ?? 0);
  const pending = Number(wallet?.pending_balance ?? 0);
  const risk = summary?.riskThresholdGhs ?? 5000;
  const overThreshold = Number(amount) >= risk;

  return (
    <div className="space-y-6">
      {feedback && (
        <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium ${feedback.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {feedback.ok ? <IconCheck size={16} className="mt-0.5 shrink-0" /> : <IconAlert size={16} className="mt-0.5 shrink-0" />}
          <span>{feedback.msg}{feedback.dryRun ? ' (sandbox simulation - set Hubtel keys for live transfers)' : ''}</span>
        </div>
      )}

      {/* Wallet cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-brand to-emerald-700 p-5 text-white">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide opacity-80"><IconWallet size={15} /> Available now</p>
          <p className="mt-2 text-3xl font-extrabold">{ghs(available)}</p>
          <p className="mt-1 text-xs opacity-80">Instant cashout enabled</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400"><IconClock size={15} /> Pending / in review</p>
          <p className="mt-2 text-3xl font-extrabold text-charcoal">{ghs(pending)}</p>
          <p className="mt-1 text-xs text-slate-400">Awaiting admin approval</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400"><IconShield size={15} /> Risk threshold</p>
          <p className="mt-2 text-3xl font-extrabold text-charcoal">{ghs(risk)}</p>
          <p className="mt-1 text-xs text-slate-400">Above this, payouts need review</p>
        </div>
      </div>

      {/* Cashout form */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          <IconPhonePay size={17} className="text-blue-600" /> Instant Mobile Money Cashout
        </h3>
        <form onSubmit={requestPayout} className="mt-4 grid gap-4 md:grid-cols-4">
          <div>
            <label htmlFor="pay-amount" className="mb-1 block text-xs font-semibold text-slate-500">Amount (GHS)</label>
            <input id="pay-amount" type="number" min="50" step="0.01" value={amount}
              onChange={(e) => setAmount(e.target.value)} placeholder="Min 50.00" required
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-600" />
          </div>
          <div>
            <label htmlFor="pay-network" className="mb-1 block text-xs font-semibold text-slate-500">Network</label>
            <select id="pay-network" value={network} onChange={(e) => setNetwork(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-600">
              {NETWORKS.map((n) => (
                <option key={n} value={n}>
                  {n === 'VODAFONE' ? 'Telecel / Vodafone' : n === 'AT' ? 'AT Money' : 'MTN MoMo'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="pay-dest" className="mb-1 block text-xs font-semibold text-slate-500">MoMo number</label>
            <input id="pay-dest" value={destination} onChange={(e) => setDestination(e.target.value)}
              placeholder="0244123456" required
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-600" />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={busy || available <= 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-brand py-2.5 text-sm font-extrabold text-white transition hover:bg-emerald-700 disabled:opacity-40">
              {busy ? <IconSpinner size={16} /> : <IconCoins size={16} />}
              {busy ? 'Sending...' : 'Cash out now'}
            </button>
          </div>
        </form>
        {overThreshold && (
          <p className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            <IconAlert size={14} /> Amounts of {ghs(risk)} or more are queued for a quick security review before transfer.
          </p>
        )}
      </div>

      {/* History */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Payout History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-mist text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-semibold">Date</th>
                <th className="px-5 py-3 font-semibold">Destination</th>
                <th className="px-5 py-3 font-semibold">Reference</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && (
                <tr><td colSpan="5" className="px-5 py-8 text-center text-slate-400">No payouts yet.</td></tr>
              )}
              {history.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 hover:bg-mist/60">
                  <td className="px-5 py-3 text-slate-500">{new Date(p.initiated_at).toLocaleString()}</td>
                  <td className="px-5 py-3">
                    <span className="font-semibold text-charcoal">{p.destination}</span>
                    <span className="ml-2 text-xs text-slate-400">{p.network}</span>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-400">{p.reference || '-'}</td>
                  <td className="px-5 py-3"><StatusBadge status={p.status} size="sm" /></td>
                  <td className="px-5 py-3 text-right font-bold text-charcoal">{ghs(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}




/* ------------------- Rider Transit Balance (Module 4, part B) ---------------- */
function RiderTransits() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  async function load() {
    try {
      setData(await api.get('/api/pos/riders'));
    } catch (e) {
      setFeedback({ ok: false, msg: e.message });
    }
  }
  useEffect(() => { load(); }, []);

  async function reconcile(t) {
    if (!window.confirm(`Confirm ${ghs(t.amount)} received from ${t.rider_name || t.riderName}?`)) return;
    setBusy(true);
    try {
      const d = await api.post(`/api/pos/riders/${t.id}/reconcile`, {});
      setFeedback({ ok: true, msg: d.message });
      await load();
    } catch (e) {
      setFeedback({ ok: false, msg: e.message });
    } finally {
      setBusy(false);
    }
  }

  const openTransits = data?.openTransits || [];
  const reconciledHistory = data?.reconciledHistory || [];

  return (
    <div className="space-y-3">
      {feedback && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${feedback.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {feedback.ok ? <IconCheck size={16} /> : <IconAlert size={16} />} {feedback.msg}
        </div>
      )}





      <div className="space-y-3">
        {openTransits.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <div>
              <p className="font-bold text-charcoal">{t.rider_name}</p>
              <p className="text-xs text-slate-400">
                {t.orderCount} order{t.orderCount === 1 ? '' : 's'} - dispatched {new Date(t.dispatched_at).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-700">{ghs(t.amount)}</span>
              <button type="button" disabled={busy} onClick={() => reconcile(t)}
                className="rounded-xl bg-emerald-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-40">
                Reconcile cash
              </button>
            </div>
          </div>
        ))}
        {openTransits.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
            No riders currently holding cash. Dispatch COD orders to create a transit record.
          </div>
        )}

        {reconciledHistory.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Reconciled history</div>
            {reconciledHistory.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 border-t border-slate-50 px-5 py-2.5 text-sm first:border-t-0">
                <span className="text-slate-600">{t.rider_name}</span>
                <span className="text-xs text-slate-400">{new Date(t.reconciled_at).toLocaleDateString()}</span>
                <StatusBadge status="RECONCILED" size="sm" />
                <span className="font-bold text-charcoal">{ghs(t.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


export default function SellerPayouts() {
  const [tab, setTab] = useState('wallet');
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-charcoal">Payouts &amp; Rider Cash</h1>
        <p className="mt-1 text-sm text-slate-500">
          Instant Mobile Money cashouts and one-click COD reconciliation.
        </p>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => setTab('wallet')}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition ${tab === 'wallet' ? 'bg-blue-600 text-white shadow-sm' : 'bg-mist text-slate-600 hover:bg-slate-200'}`}>
          Wallet Cashout
        </button>
        <button type="button" onClick={() => setTab('riders')}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition ${tab === 'riders' ? 'bg-blue-600 text-white shadow-sm' : 'bg-mist text-slate-600 hover:bg-slate-200'}`}>
          Rider Transit Balance
        </button>
      </div>

      {tab === 'wallet' && <WalletCashout />}
      {tab === 'riders' && <RiderTransits />}
    </div>
  );
}



