/**
 * Ghana Stores seller PWA shell.
 * Hash router + deep-slate sidebar + trial banner + page mounts.
 */
import { useEffect, useMemo, useState } from 'react';
import { api, getToken, clearSession, getCachedStore } from './api.js';
import TrialBanner from './components/TrialBanner.jsx';
import DashboardLayout from './layouts/DashboardLayout.jsx';
import AuthScreen from './pages/AuthScreen.jsx';
import SellerAnalytics from './pages/SellerAnalytics.jsx';
import SellerPOS from './pages/SellerPOS.jsx';
import SellerPayouts from './pages/SellerPayouts.jsx';
import SellerInventory from './pages/SellerInventory.jsx';
import SellerThemeSelector from './pages/SellerThemeSelector.jsx';
import SellerThemeMarketplace from './pages/SellerThemeMarketplace.jsx';
import ThemeDemoViewer from './pages/ThemeDemoViewer.jsx';
import ThemeCustomizer from './pages/ThemeCustomizer.jsx';


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
    const onForceLogout = () => { clearSession(); setAuthed(false); setStore(null); };
    window.addEventListener('gs:logout', onForceLogout);
    return () => window.removeEventListener('gs:logout', onForceLogout);
  }, []);

  const page = useMemo(() => {
    // Live demo viewer with a dynamic :templateId segment.
    if (route.startsWith('#/dashboard/themes/demo/')) {
      const templateId = decodeURIComponent(route.slice('#/dashboard/themes/demo/'.length));
      return templateId ? <ThemeDemoViewer templateId={templateId} /> : <SellerThemeMarketplace />;
    }
    switch (route) {
      case '#/pos': return <SellerPOS />;
      case '#/payouts': return <SellerPayouts />;
      case '#/inventory': return <SellerInventory />;
      case '#/orders': return <SellerOrders />;
      case '#/themes': return <SellerThemeSelector />;
      case '#/dashboard/themes': return <SellerThemeMarketplace />;
      case '#/dashboard/themes/customizer': return <ThemeCustomizer chromeless />;
      default: return <SellerAnalytics />;
    }
  }, [route]);

  if (!authed) {
    return (
      <AuthScreen
        onAuthed={(s) => { setStore(s); setAuthed(true); }}
      />
    );
  }


  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-6xl space-y-5 p-5 pb-16">
        <TrialBanner billing={billing} onActivated={() => {
          api.get('/api/billing/status').then((d) => setBilling(d.billing)).catch(() => {});
        }} />
        {page}
      </div>
    </DashboardLayout>
  );
}