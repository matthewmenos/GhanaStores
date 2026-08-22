import React, { useEffect, useState } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { TrendingUp, ShoppingBag, Wallet } from 'lucide-react';
import { apiGet } from '../lib/api.js';

/**
 * SellerAnalytics — KPI tiles + 6-month revenue trend + top products.
 * Reads from GET /api/analytics/{summary,monthly-trend,top-products}.
 */
export default function SellerAnalytics() {
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [topProducts, setTopProducts] = useState([]);

  useEffect(() => {
    apiGet('/analytics/summary').then(setSummary).catch(() => {});
    apiGet('/analytics/monthly-trend').then(setTrend).catch(() => {});
    apiGet('/analytics/top-products').then(setTopProducts).catch(() => {});
  }, []);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold text-slate-950">Sales analytics</h1>
        <p className="text-sm text-slate-500">Track revenue, orders, and what's selling — updated in real time.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiTile
          icon={<Wallet size={18} className="text-success" />}
          label="Total revenue"
          value={`GHS ${(summary?.total_revenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          tone="success"
        />
        <KpiTile
          icon={<ShoppingBag size={18} className="text-brand" />}
          label="Paid orders"
          value={(summary?.paid_orders ?? 0).toLocaleString()}
          tone="brand"
        />
        <KpiTile
          icon={<TrendingUp size={18} className="text-warning" />}
          label="Average order value"
          value={`GHS ${(summary?.average_order_value ?? 0).toFixed(2)}`}
          tone="warning"
        />
      </div>

      <div className="rounded-xl2 border border-slate-200 bg-white p-4">
        <h2 className="mb-4 text-sm font-semibold text-slate-950">Revenue — last 6 months</h2>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={trend}>
            <defs>
              <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563EB" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} width={70}
                   tickFormatter={(v) => `GHS ${v}`} />
            <Tooltip formatter={(v) => [`GHS ${Number(v).toFixed(2)}`, 'Revenue']} />
            <Area type="monotone" dataKey="revenue" stroke="#2563EB" strokeWidth={2} fill="url(#revenueFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl2 border border-slate-200 bg-white p-4">
        <h2 className="mb-4 text-sm font-semibold text-slate-950">Top-selling products</h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={topProducts} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
            <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: '#0F172A' }} axisLine={false} tickLine={false} width={140} />
            <Tooltip formatter={(v) => [v, 'Units sold']} />
            <Bar dataKey="units_sold" fill="#2563EB" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function KpiTile({ icon, label, value, tone }) {
  const bg = { success: 'bg-success-50', brand: 'bg-brand-50', warning: 'bg-warning-50' }[tone];
  return (
    <div className="rounded-xl2 border border-slate-200 bg-white p-4">
      <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}>{icon}</div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-950 tabular-nums">{value}</p>
    </div>
  );
}
