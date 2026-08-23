/**
 * Ghana Stores seller PWA shell.
 * Hash router + deep-slate sidebar + trial banner + page mounts.
 */
import { useEffect, useMemo, useState } from 'react';
import { api, getToken, clearSession, getCachedStore } from './api.js';
import { LogoLockup, IconLogout, IconMenu, IconX } from './components/icons.jsx';
import TrialBanner from './components/TrialBanner.jsx';
import AuthScreen from './pages/AuthScreen.jsx';
import SellerAnalytics from './pages/SellerAnalytics.jsx';
import SellerPOS from './pages/SellerPOS.jsx';
import SellerPayouts from './pages/SellerPayouts.jsx';
import SellerInventory from './pages/SellerInventory.jsx';
import SellerThemeSelector from './pages/SellerThemeSelector.jsx';

const NAV = [
  { hash: '#/', label: 'Analytics', icon: 'dashboard' },
  { hash: '#/pos', label: 'POS Terminal', icon: 'cart' },
  { hash: '#/payouts', label: 'Payouts', icon: 'wallet' },
  { hash: '#/inventory', label: 'Inventory', icon: 'box' },
  { hash: '#/themes', label: 'Themes', icon: 'layout' },
];

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/');
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

export default function App() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  const [store, setStore] = useState(getCachedStore());
  const [billing, setBilling] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const route = useHashRoute();

  /* Refresh trial status whenever the dashboard mounts or store changes. */
  useEffect(() => {
    if (!authed) return;
    let alive = true;
    api.get('/api/billing/status')
      .then((d) => { if (alive) setBilling(d.billing); })
      .catch(() => {});
    return () => { alive = false; };
  }, [authed, route]);

  useEffect(() => {
    const onForceLogout = () => { setAuthed(false); setStore(null); };
    window.addEventListener('gs:logout', onForceLogout);
    return () => window.removeEventListener('gs:logout', onForceLogout);
  }, []);

  const page = useMemo(() => {
    switch (route) {
      case '#/pos': return <SellerPOS />;
      case '#/payouts': return <SellerPayouts />;
                  case '#/inventory': return <SellerInventory />;
      case '#/themes': return <SellerThemeSelector />;
      default: return <SellerAnalytics />;
    }
  }, [route]);

  const activeTitle = NAV.find((n) => n.hash === route)?.label
    || (route === '#/orders' ? 'Orders' : 'Analytics');

  if (!authed) {
    return (
      <AuthScreen
        onAuthed={(s) => { setStore(s); setAuthed(true); }}
      />
    );
  }

  function logout() {
    clearSession();
    setAuthed(false);
    setStore(null);
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-slate-900 transition-transform lg:translate-x-0 ${navOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-16 items-center justify-between px-5">
          <LogoLockup />
          <button type="button" onClick={() => setNavOpen(false)} className="text-slate-400 hover:text-white lg:hidden" aria-label="Close menu">
            <IconX size={20} />
          </button>
        </div>
        <nav className="mt-2 space-y-1 px-3">
          {NAV.map(({ hash, label }) => {
            const active = route === hash;
            return (
              <a key={hash} href={hash} onClick={() => setNavOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  active ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}>
                {label}
              </a>
            );
          })}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 border-t border-slate-800 p-4">
          <p className="truncate text-sm font-bold text-white">{store?.name || 'My Store'}</p>
          <a href={`https://${store?.subdomain_slug || 'shop'}.ghastores.com`}
            target="_blank" rel="noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300">
            {store?.subdomain_slug || 'shop'}.ghastores.com
          </a>
          <button type="button" onClick={logout}
            className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-red-600 hover:text-white">
            <IconLogout size={16} /> Sign out
          </button>
        </div>
      </aside>

      {navOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setNavOpen(false)} aria-hidden="true" />
      )}

      {/* Main column */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-5 backdrop-blur">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setNavOpen(true)}
              className="text-slate-500 hover:text-charcoal lg:hidden" aria-label="Open menu">
              <IconMenu size={22} />
            </button>
            <h1 className="text-lg font-extrabold tracking-tight text-charcoal">{activeTitle}</h1>
          </div>
          <span className="hidden rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 sm:block">
            GHS Wallet
          </span>
        </header>

        <main className="mx-auto max-w-6xl space-y-5 p-5 pb-16">
          <TrialBanner billing={billing} onActivated={() => {
            api.get('/api/billing/status').then((d) => setBilling(d.billing)).catch(() => {});
          }} />
          {page}
        </main>
      </div>
    </div>
  );
}
