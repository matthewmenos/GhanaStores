/**
 * DiDwa web shell.
 *
 * Route map (History API router):
 *   /                         public marketing welcome page
 *   /login                    seller authentication (register / login modes)
 *   /dashboard                PWA home -> analytics
 *   /pos | /payouts | /inventory | /orders  PWA pages
 *   /dashboard/themes...      theme market / customizer / demo viewer
 *
 * Unauthenticated visitors always land on AuthScreen for any PWA route;
 * the web index stays open so merchants can discover the product first -
 * the PWA itself starts from the login page.
 */
import { useEffect, useMemo, useState } from 'react';
import { navigate, usePathname } from './router.js';
import { api, getToken, clearSession, getCachedStore } from './api.js';
import TrialBanner from './components/TrialBanner.jsx';
import DashboardLayout from './layouts/DashboardLayout.jsx';
import AuthScreen from './pages/AuthScreen.jsx';
import WelcomePage from './pages/WelcomePage.jsx';
import { AboutPage, ContactPage, PrivacyPage, TermsPage } from './pages/PublicPages.jsx';
import SellerAnalytics from './pages/SellerAnalytics.jsx';
import SellerPOS from './pages/SellerPOS.jsx';
import SellerPayouts from './pages/SellerPayouts.jsx';
import SellerInventory from './pages/SellerInventory.jsx';
import SellerOrders from './pages/SellerOrders.jsx';
import SellerThemeSelector from './pages/SellerThemeSelector.jsx';
import SellerThemeMarketplace from './pages/SellerThemeMarketplace.jsx';
import ThemeDemoViewer from './pages/ThemeDemoViewer.jsx';
import ThemeCustomizer from './pages/ThemeCustomizer.jsx';
import DomainManager from './pages/DomainManager.jsx';
import LiveStorefront from './pages/LiveStorefront.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';


export default function App() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  const [store, setStore] = useState(getCachedStore());
  const [billing, setBilling] = useState(null);
  /* Preselected tab when the welcome page opens the auth screen. */
  const [authMode, setAuthMode] = useState('register');
  /* Set when the server reports the current host is a system root, which
     overrides the client-side host guess and renders the marketing site. */
  const [hostIsPlatform, setHostIsPlatform] = useState(false);
  const route = usePathname();

  /* Server-authoritative Host classification. The env var behind the
     client-side guess is baked in at build time and can be stale, so the API
     owns the final word: platform root -> marketing site, tenant -> storefront. */
  const [hostState, setHostState] = useState({ status: 'pending', tenant: null, isPlatformRoot: false });
  const host = window.location.hostname.toLowerCase();
  const platform = String(import.meta.env.VITE_PLATFORM_DOMAIN || '').replace(/^https?:\/\//, '').split('/')[0];
  const platformHost = platform.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
  const isPlatformHost = !platformHost || host === platformHost || host === `www.${platformHost}` || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.vercel.app');
  // A host is tenanted only when it is a real subdomain of the platform apex.
  // Never treat "any host containing a dot" as a tenant: that misclassifies www
  // and other platform hosts, and the storefront then requests a bogus slug.
  const isPlatformSubdomain = Boolean(platformHost)
    && host.endsWith(`.${platformHost}`)
    && host !== `www.${platformHost}`
    && host !== `api.${platformHost}`;
  // A seller custom domain is not derivable from the client, so any other
  // non-platform host is offered to the storefront, which resolves it through
  // the API and renders a clean error when no store claims it.
  const isPlatformHostWithSubdomains = isPlatformHost || host === `api.${platformHost}`;
  const isTenantHost = isPlatformSubdomain
    || (!isPlatformHostWithSubdomains && host.includes('.') && host.split('.').length >= 2);

  /* The API classifies the Host header. This is the authoritative answer: the
     client-side guess above depends on a build-time env var that can be stale,
     which is how the apex domain ended up mounting a storefront. */
  useEffect(() => {
    let alive = true;
    api.get('/api/domains/resolve')
      .then((resolved) => {
        if (!alive) return;
        setHostState({
          status: resolved?.tenant ? 'tenant' : (resolved?.isPlatformRoot ? 'platform' : 'unresolved'),
          tenant: resolved?.tenant || null,
          isPlatformRoot: Boolean(resolved?.isPlatformRoot),
        });
      })
      .catch(() => { if (alive) setHostState({ status: 'error', tenant: null, isPlatformRoot: false }); });
    return () => { alive = false; };
  }, []);

  /* Derived from the server answer so the apex can never be treated as a
     tenant, whatever the baked-in VITE_PLATFORM_DOMAIN says. */
  const serverSaysPlatform = hostState.status === 'platform';
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
    if (authed && route === '/login') navigate('/dashboard');
  }, [authed, route]);

  /* Welcome-page CTAs open the auth screen with the right tab preselected. */
  const openAuth = (mode = 'register') => {
    setAuthMode(mode);
    navigate('/login');
  };

  /* Post-auth landing: always inside the PWA, never back on marketing. */
  function handleAuthed(nextStore) {
    setStore(nextStore);
    setAuthed(true);
    if (route !== '/dashboard') {
      navigate('/dashboard');
    }
  }

  const page = useMemo(() => {
    // Live demo viewer with a dynamic :templateId segment.
    if (route.startsWith('/dashboard/themes/demo/')) {
      const templateId = decodeURIComponent(route.slice('/dashboard/themes/demo/'.length));
      return templateId ? <ThemeDemoViewer templateId={templateId} /> : <SellerThemeMarketplace />;
    }
    switch (route) {
      case '/admin': return <AdminDashboard />;
      case '/dashboard': return <SellerAnalytics />;
      case '/login': return null; // redirected by the effect above
      case '/pos': return <SellerPOS />;
      case '/payouts': return <SellerPayouts />;
      case '/inventory': return <SellerInventory />;
      case '/orders': return <SellerOrders />;
      case '/themes': return <SellerThemeSelector />;
      case '/dashboard/themes': return <SellerThemeMarketplace />;
      case '/dashboard/themes/customizer': return <ThemeCustomizer chromeless />;
      case '/domains': return <DomainManager subdomain={store?.subdomain_slug} storeId={store?.id} />;
      default: return <SellerAnalytics />;
    }
  }, [route]);

  /* Public web pages - open to everyone, no dashboard chrome. The index
     (#/) plus About / Contact / Terms / Privacy stay reachable whether or
     not a seller is signed in. */
  /* Tenant storefront hosts are public and never require seller auth. The
     server has the final word: it is asked what this host is before anything
     storefront-shaped renders, so the apex/www/app/api hosts always reach the
     marketing site instead of firing a bogus /storefront/<host>/products call.
     A stale or wrong VITE_PLATFORM_DOMAIN is therefore harmless. */
  if (isTenantHost && !hostIsPlatform && !serverSaysPlatform) {
    /* Wait for the server before mounting the storefront: without this the
       apex renders a storefront for a moment and requests itself as a slug. */
    if (hostState.status === 'pending') {
      return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading store...</div>;
    }
    return <LiveStorefront resolvedHost={hostState} onPlatformHost={() => setHostIsPlatform(true)} />;
  }

  const welcomeProps = {
    authed,
    onStart: openAuth,
    onDashboard: () => { navigate('/dashboard'); },
  };
  switch (route) {
    case '/': return <WelcomePage {...welcomeProps} />;
    case '/about': return <AboutPage authed={authed} />;
    case '/contact': return <ContactPage authed={authed} />;
    case '/terms': return <TermsPage authed={authed} />;
    case '/privacy': return <PrivacyPage authed={authed} />;
    default: break;
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
