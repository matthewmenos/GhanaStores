import React from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { BarChart3, ShoppingCart, Wallet, Boxes } from 'lucide-react';
import TrialBanner from './components/TrialBanner.jsx';
import SellerAnalytics from './pages/SellerAnalytics.jsx';
import SellerPOS from './pages/SellerPOS.jsx';
import SellerPayouts from './pages/SellerPayouts.jsx';
import SellerInventory from './pages/SellerInventory.jsx';

const NAV_ITEMS = [
  { to: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/dashboard/pos', label: 'Point of sale', icon: ShoppingCart },
  { to: '/dashboard/payouts', label: 'Payouts', icon: Wallet },
  { to: '/dashboard/inventory', label: 'Inventory', icon: Boxes },
];

export default function App() {
  const authToken = typeof window !== 'undefined' ? localStorage.getItem('gs_auth_token') : null;

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50">
        <TrialBanner authToken={authToken} />

        <div className="flex">
          <nav className="hidden w-56 shrink-0 border-r border-slate-200 bg-white p-4 sm:block">
            <p className="mb-4 px-2 text-sm font-bold text-slate-950">Ghana Stores</p>
            <ul className="space-y-1">
              {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      `flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                        isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'
                      }`
                    }
                  >
                    <Icon size={16} />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <main className="flex-1">
            <Routes>
              <Route path="/dashboard/analytics" element={<SellerAnalytics />} />
              <Route path="/dashboard/pos" element={<SellerPOS />} />
              <Route path="/dashboard/payouts" element={<SellerPayouts />} />
              <Route path="/dashboard/inventory" element={<SellerInventory />} />
              <Route path="*" element={<SellerAnalytics />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
