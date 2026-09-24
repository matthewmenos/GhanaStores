/**
 * Seller Analytics & KPI dashboard (Module 2).
 * Recharts-powered revenue trend + GHS KPI cards + operations counters.
 */
import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip,
} from 'recharts';
import { api, ghs } from '../api.js';
import StatusBadge from '../components/UI/StatusBadge.jsx';
import {
  IconTrendUp, IconReceipt, IconWallet, IconTruck,
  IconBox, IconUsers, IconSpinner, IconAlert,
} from '../components/icons.jsx';

function KpiCard({ icon: Icon, tone, label, value, sub }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <span className={`inline-block rounded-xl p-2 text-white ${tone}`}>
        <Icon size={18} />
      </span>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-2xl font-extrabold text-charcoal">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export default function SellerAnalytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/analytics/dashboard')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm font-medium text-red-700">
        <IconAlert size={16} /> {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        <IconSpinner size={28} />
      </div>
    );
  }

  const { kpis, monthlyTrend, recentOrders, operations } = data;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={IconTrendUp} tone="bg-blue-600" label="Total Revenue"
          value={ghs(kpis.totalRevenue)} sub={`Today ${ghs(kpis.todayRevenue)}`} />
        <KpiCard icon={IconReceipt} tone="bg-emerald-brand" label="Paid Orders"
          value={kpis.paidOrders.toLocaleString()} sub={`${ghs(kpis.averageOrderValue)} AOV`} />
        <KpiCard icon={IconWallet} tone="bg-orange-600" label="Rider Transit Cash"
          value={ghs(operations.transitCash)} sub="Awaiting reconciliation" />
        <KpiCard icon={IconUsers} tone="bg-violet-600" label="Loyalty Members"
          value={operations.loyaltyMembers.toLocaleString()}
          sub={`${operations.outstandingPoints.toLocaleString()} pts outstanding`} />
      </div>

      {operations.lowStockCount > 0 && (
        <a href="/inventory" className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100">
          <IconBox size={17} className="text-amber-600" />
          {operations.lowStockCount} variant{operations.lowStockCount === 1 ? '' : 's'} low on stock - SMS alerts sent.
          <span className="ml-auto text-xs underline">Review inventory</span>
        </a>
      )}

      {/* Revenue trend */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Monthly Revenue (GHS)</h3>
          <span className="text-xs text-slate-400">Last 6 months</span>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={monthlyTrend} margin={{ top: 5, right: 8, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563EB" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#2563EB" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false}
              tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
              width={44}
            />
            <Tooltip
              formatter={(v) => [ghs(v), 'Revenue']}
              contentStyle={{ borderRadius: 12, borderColor: '#E2E8F0', fontSize: 13 }}
            />
            <Area type="monotone" dataKey="revenue" stroke="#2563EB" strokeWidth={2.5}
              fill="url(#revGrad)" activeDot={{ r: 5, fill: '#2563EB' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Recent orders */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Recent Orders</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-mist text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-semibold">Order</th>
                <th className="px-5 py-3 font-semibold">Customer</th>
                <th className="px-5 py-3 font-semibold">Channel</th>
                <th className="px-5 py-3 font-semibold">Payment</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length === 0 && (
                <tr><td colSpan="6" className="px-5 py-8 text-center text-slate-400">No orders yet.</td></tr>
              )}
              {recentOrders.map((o) => (
                <tr key={o.id} className="border-t border-slate-100 hover:bg-mist/60">
                  <td className="px-5 py-3 font-semibold text-charcoal">{o.orderNumber}</td>
                  <td className="px-5 py-3 text-slate-600">{o.customerName}</td>
                  <td className="px-5 py-3 text-slate-500">{o.channel}</td>
                  <td className="px-5 py-3 text-slate-500">{o.paymentMethod}</td>
                  <td className="px-5 py-3"><StatusBadge status={o.status} size="sm" /></td>
                  <td className="px-5 py-3 text-right font-bold text-charcoal">{ghs(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


