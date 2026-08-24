/**
 * Ghana Stores web shell.
 *
 * Route map (hash router):
 *   #/                       public marketing welcome page - the web index
 *   #/login                  seller authentication (register / login modes)
 *   #/dashboard              PWA home -> analytics
 *   #/pos | payouts | inventory | orders        PWA pages
 *   #/dashboard/themes...    theme market / customizer / demo viewer
 *
 * Unauthenticated visitors always land on AuthScreen for any PWA route;
 * the web index stays open so merchants can discover the product first -
 * the PWA itself starts from the login page.
 */
import { useEffect, useMemo, useState } from 'react';
import { api, getToken, clearSession, getCachedStore } from './api.js';
import TrialBanner from './components/TrialBanner.jsx';
import DashboardLayout from './layouts/DashboardLayout.jsx';
import AuthScreen from './pages/AuthScreen.jsx';
import WelcomePage from './pages/WelcomePage.jsx';
import SellerAnalytics from './pages/SellerAnalytics.jsx';
import SellerPOS from './pages/SellerPOS.jsx';
import SellerPayouts from './pages/SellerPayouts.jsx';
import SellerInventory from './pages/SellerInventory.jsx';
import SellerOrders from './pages/SellerOrders.jsx';
import SellerThemeSelector from './pages/SellerThemeSelector.jsx';
import SellerThemeMarketplace from './pages/SellerThemeMarketplace.jsx';
import ThemeDemoViewer from './pages/ThemeDemoViewer.jsx';
import ThemeCustomizer from './pages/ThemeCustomizer.jsx';

const LOGIN_HASH = '#/login';

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
  /* Preselected tab when the welcome page opens the auth screen. */
  const [authMode, setAuthMode] = useState('register');
  const route = useHashRoute();

  /* Refresh trial status whenever the dashboard mounts or route changes. */
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

  /* Signed-in sellers never sit on the auth screen. */
  useEffect(() => {
    if (authed && route === LOGIN_HASH) window.location.hash = '#/dashboard';
  }, [authed, route]);

  /* Welcome-page CTAs open the auth screen with the right tab preselected. */
  const openAuth = (mode = 'register') => {
    setAuthMode(mode);
    window.location.hash = LOGIN_HASH;
  };

  /* Post-auth landing: always inside the PWA, never back on marketing. */
  function handleAuthed(nextStore) {
    setStore(nextStore);
    setAuthed(true);
    if (!window.location.hash.startsWith('#/dashboard')) {
      window.location.hash = '#/dashboard';
    }
  }

  const page = useMemo(() => {
    // Live demo viewer with a dynamic :templateId segment.
    if (route.startsWith('#/dashboard/themes/demo/')) {
      const templateId = decodeURIComponent(route.slice('#/dashboard/themes/demo/'.length));
      return templateId ? <ThemeDemoViewer templateId={templateId} /> : <SellerThemeMarketplace />;
    }
    switch (route) {
      case '#/dashboard': return <SellerAnalytics />;
      case LOGIN_HASH: return null; // redirected by the effect above
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

  /* Public web index - open to everyone, no dashboard chrome. */
  if (route === '#/') {
    return (
      <WelcomePage
        authed={authed}
        onStart={openAuth}
        onDashboard={() => { window.location.hash = '#/dashboard'; }}
      />
    );
  }

  /* PWA starts from the login page for unauthenticated visitors. */
  if (!authed) {
    return <AuthScreen key={authMode} initialMode={authMode} onAuthed={handleAuthed} />;
  }

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-6xl space-y-5 p-5 pb-16">
        <TrialBanner billing={billing} onActivated={() => {
          api.get('/api/billing/status').then((d) => setBilling(d.billing)).catch(() => {});
        }} />
        {page ?? <SellerAnalytics />}
      </div>
    </DashboardLayout>
  );
}
