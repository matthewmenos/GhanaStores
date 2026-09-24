/**
 * SellerOrders - fulfillment console for the shared order ledger.
 * STRICT RULE: pure SVG / Lucide-style icons only, ZERO emojis.
 */
import { useEffect, useMemo, useState } from 'react';
import { api, ghs, shortDate } from '../api.js';
import {
  IconSearch, IconCheck, IconAlert, IconSpinner, IconWhatsApp,
  IconTruck, IconX, IconClock, IconCash, IconReceipt, IconBox,
} from '../components/icons.jsx';
import { ArrowLeft } from 'lucide-react';

const STATUS_TABS = [
  { key: 'ALL',        label: 'All' },
  { key: 'PENDING',    label: 'Pending' },
  { key: 'PROCESSING', label: 'Processing' },
  { key: 'DELIVERED',  label: 'Delivered' },
  { key: 'CANCELLED',  label: 'Cancelled' },
];

/** Allowed lifecycle transitions per status. */
const TRANSITIONS = {
  PENDING:    ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['DELIVERED', 'CANCELLED'],
  DELIVERED:  [],
  CANCELLED:  [],
};

const STATUS_STYLE = {
  PENDING:    'bg-amber-100 text-amber-800',
  PROCESSING: 'bg-blue-100 text-blue-700',
  DELIVERED:  'bg-emerald-100 text-emerald-700',
  CANCELLED:  'bg-red-100 text-red-700',
};

function StatusIcon({ status }) {
  if (status === 'PENDING') return <IconClock size={12} />;
  if (status === 'PROCESSING') return <IconSpinner size={12} className="animate-spin" />;
  if (status === 'DELIVERED') return <IconTruck size={12} />;
  return <IconX size={12} />;
}

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLE[status] || 'bg-slate-100 text-slate-600'}`}>
      <StatusIcon status={status} /> {status}
    </span>
  );
}

function PayBadge({ method, status }) {
  const paid = status === 'PAID';
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold ${
      paid ? 'bg-emerald-50 text-emerald-700' : 'bg-mist text-slate-600'
    }`}>
      <IconCash size={11} /> {method}
      {!paid && ` · ${status}`}
    </span>
  );
}

/** Ghana-friendly WhatsApp deep link with a pre-filled confirmation template. */
export function waLink(order) {
  let phone = String(order.customer?.phone || '').replace(/\D/g, '');
  if (phone.startsWith('0')) phone = `233${phone.slice(1)}`;
  const lines = [
    `Hello ${order.customer?.name || ''}, your order from DiDwa is confirmed.`,
    '',
    `Order: ${order.orderNumber}`,
    ...order.items.map((i) => `- ${i.quantity} x ${i.productName} (${ghs(i.totalPrice)})`),
    `Total: ${ghs(order.totalAmount)}`,
    `Delivery to: ${order.customer?.address || ''}`,
    `Payment: ${order.paymentMethod}${order.paymentStatus === 'PAID' ? ' (paid)' : ' on delivery'}`,
    '',
    'We will reach out shortly to arrange delivery. Thank you.',
  ];
  return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`;
}
/** Desktop table view (lg and up). */
function OrdersTable({ orders, busyId, onTransition, onMarkPaid }) {
  return (
    <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white md:block">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-mist text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-3 font-semibold">Order</th>
              <th className="px-5 py-3 font-semibold">Customer</th>
              <th className="px-5 py-3 font-semibold">Items</th>
              <th className="px-5 py-3 font-semibold">Total</th>
              <th className="px-5 py-3 font-semibold">Payment</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const next = TRANSITIONS[o.orderStatus] || [];
              const busy = busyId === o.id;
              const more = o.items.length - 1;
              return (
                <tr key={o.id} className="border-t border-slate-100 align-top hover:bg-mist/50">
                  <td className="px-5 py-3.5">
                    <p className="font-bold text-charcoal">{o.orderNumber}</p>
                    <p className="text-xs text-slate-400">{shortDate(o.createdAt)}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-charcoal">{o.customer.name}</p>
                    <p className="text-xs text-slate-500">{o.customer.phone}</p>
                    <p className="max-w-[180px] truncate text-xs text-slate-400" title={o.customer.address}>
                      {o.customer.address}
                    </p>
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="text-slate-700">{o.items[0]?.productName}</p>
                    {o.items[0] && (
                      <p className="text-xs text-slate-400">
                        x{o.items[0].quantity}
                        {more > 0 ? ` + ${more} more` : ''}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3.5 font-extrabold text-charcoal">{ghs(o.totalAmount)}</td>
                  <td className="px-5 py-3.5">
                    <PayBadge method={o.paymentMethod} status={o.paymentStatus} />
                    {!paidFlag(o.paymentStatus) && (
                      <button
                        type="button"
                        onClick={() => onMarkPaid(o)}
                        disabled={busy}
                        className="mt-1 block rounded-md px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-40"
                      >
                        Mark paid
                      </button>
                    )}
                  </td>
                  <td className="px-5 py-3.5"><StatusBadge status={o.orderStatus} /></td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <a href={waLink(o)} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${o.customer.name}`}
                         className="rounded-lg bg-emerald-50 p-2 text-emerald-600 transition hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                        <IconWhatsApp size={15} />
                      </a>
                      {next.includes('PROCESSING') && (
                        <button type="button" onClick={() => onTransition(o, 'PROCESSING')} disabled={busy}
                          title="Start processing"
                          className="flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-2 text-[11px] font-bold text-blue-700 transition hover:bg-blue-100 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                          <IconClock size={13} /> Process
                        </button>
                      )}
                      {next.includes('DELIVERED') && (
                        <button type="button" onClick={() => onTransition(o, 'DELIVERED')} disabled={busy}
                          title="Mark delivered"
                          className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-2 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                          <IconCheck size={13} /> Delivered
                        </button>
                      )}
                      {next.includes('CANCELLED') && (
                        <button type="button" onClick={() => onTransition(o, 'CANCELLED')} disabled={busy}
                          title="Cancel order"
                          className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                          aria-label={`Cancel order ${o.orderNumber}`}>
                          <IconX size={14} />
                        </button>
                      )}
                      {next.length === 0 && <span className="pr-1 text-xs text-slate-300">Closed</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function paidFlag(status) {
  return String(status).toUpperCase() === 'PAID';
}
/** Mobile card view (below md). */
function OrderCards({ orders, busyId, onTransition, onMarkPaid }) {
  return (
    <div className="space-y-3 md:hidden">
      {orders.map((o) => {
        const next = TRANSITIONS[o.orderStatus] || [];
        const busy = busyId === o.id;
        return (
          <article key={o.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-charcoal">{o.orderNumber}</p>
                <p className="text-xs text-slate-400">{shortDate(o.createdAt)}</p>
              </div>
              <StatusBadge status={o.orderStatus} />
            </div>

            <div className="mt-3 space-y-1.5 text-sm">
              <p className="font-semibold text-charcoal">{o.customer.name}</p>
              <a href={`tel:${o.customer.phone}`} className="block text-xs text-blue-600">{o.customer.phone}</a>
              <p className="text-xs text-slate-500">{o.customer.address}</p>
            </div>

            <ul className="mt-3 space-y-1 rounded-xl bg-mist/70 p-3 text-xs text-slate-600">
              {o.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-2">
                  <span className="truncate">{i.quantity} x {i.productName}</span>
                  <span className="shrink-0 font-bold text-charcoal">{ghs(i.totalPrice)}</span>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex items-center justify-between gap-2">
              <PayBadge method={o.paymentMethod} status={o.paymentStatus} />
              <span className="text-base font-extrabold text-charcoal">{ghs(o.totalAmount)}</span>
            </div>

            {!paidFlag(o.paymentStatus) && (
              <button
                type="button"
                onClick={() => onMarkPaid(o)}
                disabled={busy}
                className="mt-2 w-full rounded-lg bg-emerald-50 py-1.5 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-40"
              >
                Mark payment received
              </button>
            )}

            <div className="mt-3 flex items-center gap-2">
              <a href={waLink(o)} target="_blank" rel="noreferrer"
                 className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                 aria-label={`WhatsApp ${o.customer.name}`}>
                <IconWhatsApp size={14} /> WhatsApp
              </a>
              {next.includes('PROCESSING') && (
                <button type="button" onClick={() => onTransition(o, 'PROCESSING')} disabled={busy}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  <IconClock size={13} /> Process
                </button>
              )}
              {next.includes('DELIVERED') && (
                <button type="button" onClick={() => onTransition(o, 'DELIVERED')} disabled={busy}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                  <IconCheck size={13} /> Delivered
                </button>
              )}
              {next.includes('CANCELLED') && (
                <button type="button" onClick={() => onTransition(o, 'CANCELLED')} disabled={busy}
                  aria-label={`Cancel order ${o.orderNumber}`}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
                  <IconX size={15} />
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
/** Seller order fulfillment console. */
export default function SellerOrders() {
  const [orders, setOrders] = useState([]);
  const [counts, setCounts] = useState({});
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);

  async function load(status) {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/api/seller/orders?status=${encodeURIComponent(status)}`);
      setOrders(res.orders || []);
      setCounts(res.counts || {});
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(tab); }, [tab]);

  // Real-time client-side search: customer name, phone, or order id/number.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) =>
      `${o.orderNumber} ${o.id} ${o.customer.name} ${o.customer.phone}`
        .toLowerCase()
        .includes(q));
  }, [orders, search]);

  async function patchStatus(order, body, successMsg) {
    if (busyId) return;
    setBusyId(order.id);
    setToast(null);
    try {
      await api.patch(`/api/seller/orders/${order.id}/status`, body);
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...body } : o)));
      setCounts((c) => ({ ...c }));
      load(tab);
      setToast({ ok: true, msg: successMsg });
    } catch (e) {
      setToast({ ok: false, msg: e.message });
    } finally {
      setBusyId(null);
    }
  }

  const onTransition = (order, nextStatus) =>
    patchStatus(order, { order_status: nextStatus }, `Order ${order.orderNumber} marked ${nextStatus.toLowerCase()}.`);
  const onMarkPaid = (order) =>
    patchStatus(order, { payment_status: 'PAID' }, `Payment for ${order.orderNumber} recorded.`);
  return (
    <div className="space-y-4">
      {/* Status tabs + search */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Filter orders by status">
          {STATUS_TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                tab === key
                  ? 'border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700'
              }`}
            >
              {label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
                tab === key ? 'bg-white/25 text-white' : 'bg-mist text-slate-500'
              }`}>
                {counts[key] ?? 0}
              </span>
            </button>
          ))}
        </div>

        <div className="relative lg:w-80">
          <IconSearch size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone or order ID..."
            aria-label="Search orders by customer name, phone or order ID"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:ring-2 focus:ring-blue-500/40"
          />
        </div>
      </div>

      {/* Feedback */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">
          <IconAlert size={16} /> {error}
        </div>
      )}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${toast.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}
        >
          {toast.ok ? <IconCheck size={16} /> : <IconAlert size={16} />}
          {toast.msg}
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss message"
                  className="ml-auto rounded p-0.5 transition hover:bg-black/5">
            <IconX size={14} />
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex h-64 items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white text-slate-400">
          <IconSpinner size={22} className="animate-spin" />
          <span className="text-sm font-medium">Loading orders...</span>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          {search ? <IconSearch size={28} className="mx-auto text-slate-300" /> : <IconReceipt size={28} className="mx-auto text-slate-300" />}
          <p className="mt-3 text-sm font-semibold text-slate-500">
            {search ? 'No orders match your search.' : `No ${tab === 'ALL' ? '' : tab.toLowerCase() + ' '}orders yet.`}
          </p>
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="mt-3 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <>
          <OrdersTable orders={visible} busyId={busyId} onTransition={onTransition} onMarkPaid={onMarkPaid} />
          <OrderCards orders={visible} busyId={busyId} onTransition={onTransition} onMarkPaid={onMarkPaid} />
        </>
      )}
    </div>
  );
}