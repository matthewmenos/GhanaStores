/**
 * WelcomePage - public marketing index for DiDwa.
 * Tells visitors what the platform does and funnels them into the seller
 * PWA (register / login). Rendered at the site root with NO
 * dashboard chrome, open to everyone.
 *
 * Props:
 *   authed       - hides "sign in", offers "Open dashboard" instead.
 *   onStart(m)   - open auth screen preselected to 'register'|'login'.
 *   onDashboard()- send an authenticated seller into the PWA.
 *
 * STRICT RULE: pure SVG / Lucide React icons ONLY - ZERO emojis.
 */
import { useEffect, useState } from 'react';
import {
  ArrowRight, BarChart3, BellRing, Check, ChevronRight, Globe,
  Menu, MessageCircle, Package, ShieldCheck, Smartphone, Sparkles,
  Wallet, X, Zap,
} from 'lucide-react';
import { LogoLockup } from '../components/icons.jsx';

/** Smooth-scroll to an in-page section id. */
function goTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const FEATURE_CARDS = [
  { Icon: Smartphone, title: 'Offline-first POS', body: 'Ring up sales with no internet - transactions sync the moment you are back online.' },
  { Icon: Wallet, title: 'Instant MoMo payouts', body: 'Cash out to MTN, Telecel/Vodafone or AT Money the moment an order settles.' },
  { Icon: Package, title: 'Inventory that thinks', body: 'Multi-variant stock tracking with automatic low-stock SMS reminders.' },
  { Icon: MessageCircle, title: 'WhatsApp commerce', body: 'Customers order straight from chat; receipts and fulfilment in one tap.' },
  { Icon: Globe, title: 'Your own storefront', body: 'A shareable subdomain - or bring a custom domain - with live theme editing.' },
  { Icon: BarChart3, title: 'Insights that pay', body: 'Best sellers, cash flow and payout readiness without spreadsheets.' },
];

const STEPS = [
  { n: '01', title: 'Create your store', body: 'Register with just a shop name, email and phone number. Your 14-day trial starts instantly - no card needed.' },
  { n: '02', title: 'Stock your catalog', body: 'Add products with prices, variants and stock counts. Share your storefront link or sell in person.' },
  { n: '03', title: 'Sell & get paid', body: 'Accept Mobile Money or cash, reconcile rider deliveries and withdraw earnings whenever you like.' },
];

const STATS = [
  { v: '10k+', k: 'Active sellers' },
  { v: 'GHS 2.4M', k: 'Processed monthly' },
  { v: '<24h', k: 'Payout settlement' },
  { v: '16', k: 'Regions covered' },
];

export default function WelcomePage({ authed = false, onStart, onDashboard }) {
  const start = onStart || (() => {});
  const dashboard = onDashboard || (() => {});

  /* Mobile slide-in site menu (<768px). */
  const [menuOpen, setMenuOpen] = useState(false);

  /* Escape closes the menu; background scroll locks while it is open. */
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-white text-charcoal">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-slate-900/5 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="DiDwa home">
            <LogoLockup onLight />
          </button>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-500 lg:flex" aria-label="Sections">
            {[['features', 'Features'], ['how', 'How it works'], ['stats', 'Why us']].map(([id, label]) => (
              <button key={id} type="button" onClick={() => goTo(id)} className="transition hover:text-charcoal">{label}</button>
            ))}
            <span className="h-4 w-px bg-slate-200" aria-hidden="true" />
            <a href="/about" className="transition hover:text-charcoal">About Us</a>
            <a href="/contact" className="transition hover:text-charcoal">Contact Us</a>
          </nav>
          <div className="flex items-center gap-2">
            {/* Hamburger - mobile site menu */}
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:hidden"
            >
              <Menu size={22} aria-hidden="true" />
            </button>
            {!authed && (
              <button type="button" onClick={() => start('login')} className="rounded-xl px-3.5 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-100 hover:text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                Sign in
              </button>
            )}
            {authed ? (
              <button type="button" onClick={dashboard} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700">
                Open dashboard <ArrowRight size={15} aria-hidden="true" />
              </button>
            ) : (
              <button type="button" onClick={() => start('register')} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700">
                Start free <ArrowRight size={15} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-32 top-10 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute right-0 top-40 h-96 w-96 rounded-full bg-emerald-brand/10 blur-3xl" aria-hidden="true" />

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-2 lg:pt-24">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
              <Sparkles size={12} aria-hidden="true" /> Built for Ghanaian commerce
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl">
              Sell in-store &amp; online.
              <span className="mt-1 block bg-gradient-to-r from-blue-600 to-emerald-brand bg-clip-text text-transparent">Get paid instantly.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-500 sm:text-lg">
              DiDwa is the all-in-one companion for Ghanaian merchants: a POS that works offline, Mobile Money payouts,
              inventory with smart alerts, WhatsApp ordering and a storefront you can theme - all from one login.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {authed ? (
                <button type="button" onClick={dashboard} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-bold text-white shadow-xl shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
                  Open your dashboard <ArrowRight size={16} aria-hidden="true" />
                </button>
              ) : (
                <button type="button" onClick={() => start('register')} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-bold text-white shadow-xl shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
                  Start your free trial <ArrowRight size={16} aria-hidden="true" />
                </button>
              )}
              <button type="button" onClick={() => goTo('how')} className="rounded-xl border border-slate-200 px-6 py-3.5 text-sm font-bold text-slate-600 transition hover:border-slate-300 hover:text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
                See how it works
              </button>
            </div>

            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs font-semibold text-slate-400">
              {['No card required', 'Free 14-day trial', 'Cancel anytime'].map((x) => (
                <li key={x} className="flex items-center gap-1.5"><Check size={13} className="text-emerald-brand" aria-hidden="true" /> {x}</li>
              ))}
            </ul>
          </div>

          {/* App-preview collage (pure CSS) */}
          <div className="relative hidden h-[380px] select-none sm:block" aria-hidden="true">
            <div className="absolute right-0 top-6 w-72 rotate-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-card transition-transform duration-300 hover:rotate-1">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">This week</p>
              <div className="mt-4 flex h-28 items-end gap-2">
                {[42, 68, 55, 82, 60, 95, 74, 100].map((h, i) => (
                  <span key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-blue-600/80 to-blue-400" style={{ height: `${h}%` }} />
                ))}
              </div>
              <p className="mt-3 text-xs font-bold text-slate-500">Sales trending up 18%</p>
            </div>

            <div className="absolute left-2 top-36 w-80 -rotate-2 rounded-2xl border border-slate-100 bg-white p-5 shadow-card transition-transform duration-300 hover:-rotate-1">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">Live activity</p>
              <ul className="mt-3 space-y-3">
                {[
                  { Icon: Wallet, tone: 'bg-emerald-100 text-emerald-700', text: 'MoMo payout sent', meta: '+ GHS 480.00' },
                  { Icon: MessageCircle, tone: 'bg-blue-100 text-blue-700', text: 'New WhatsApp order', meta: 'Kente scarf x2' },
                  { Icon: BellRing, tone: 'bg-amber-100 text-amber-700', text: 'Low stock alert', meta: 'Shea butter - 3 left' },
                ].map(({ Icon, tone, text, meta }) => (
                  <li key={text} className="flex items-center gap-3">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tone}`}><Icon size={15} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold">{text}</span>
                      <span className="block truncate text-[11px] text-slate-400">{meta}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <span className="absolute right-10 top-0 inline-flex items-center gap-1.5 rounded-full bg-[#0B1120] px-3.5 py-1.5 text-[11px] font-bold text-white shadow-lg">
              <Zap size={12} className="text-emerald-400" /> 14-day free trial
            </span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-extrabold uppercase tracking-widest text-blue-600">Everything included</span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">One login. Every tool your shop needs.</h2>
          <p className="mt-4 text-base text-slate-500">Stop stitching together notebooks, calculators and chat threads - DiDwa runs the whole sale, end to end.</p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURE_CARDS.map(({ Icon, title, body }) => (
            <article key={title} className="group rounded-2xl border border-slate-100 bg-white p-6 shadow-card ring-1 ring-slate-900/5 transition duration-300 hover:-translate-y-1 hover:shadow-lg">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-600 transition group-hover:bg-blue-600 group-hover:text-white">
                <Icon size={19} aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-base font-extrabold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 bg-mist/70 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-extrabold uppercase tracking-widest text-blue-600">Up and running in minutes</span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Three steps to your first sale</h2>
          </div>

          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map(({ n, title, body }) => (
              <li key={n} className="relative rounded-2xl border border-slate-100 bg-white p-6 shadow-card">
                <span className="inline-grid h-10 w-10 place-items-center rounded-xl bg-[#0B1120] text-sm font-extrabold text-emerald-400">{n}</span>
                <h3 className="mt-4 text-base font-extrabold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Stats / why us */}
      <section id="stats" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20">
        <div className="overflow-hidden rounded-3xl bg-[#0B1120] px-8 py-12 text-white sm:px-12">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-extrabold uppercase tracking-widest text-emerald-400">Why merchants switch</span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight">The back office that runs itself</h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-300 sm:text-base">From kiosks at Makola to growing boutiques in Kumasi - sellers use DiDwa to keep books clean and cash moving.</p>
          </div>
          <dl className="mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-6 text-center md:grid-cols-4">
            {STATS.map(({ v, k }) => (
              <div key={k}>
                <dt className="order-last mt-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">{k}</dt>
                <dd className="text-2xl font-extrabold text-emerald-400 sm:text-3xl">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mx-auto mt-10 flex max-w-md items-center justify-center gap-2 text-center text-xs font-semibold text-slate-400">
            <ShieldCheck size={14} className="shrink-0 text-emerald-400" aria-hidden="true" />
            Your data is encrypted and your storefront runs on its own secure web address.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl px-8 py-14 text-center text-white sm:px-12" style={{ background: 'linear-gradient(125deg, #1D4ED8 0%, #2563EB 45%, var(--tw-gradient-stops))', backgroundImage: 'linear-gradient(125deg,#1D4ED8 0%,#059669 160%)' }}>
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Ready to sell smarter?</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-blue-100 sm:text-base">Join thousands of Ghanaian merchants running their entire shop from one app. Free for 14 days.</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {authed ? (
              <button type="button" onClick={dashboard} className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-sm font-bold text-blue-700 shadow-xl transition hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
                Open your dashboard <ArrowRight size={16} aria-hidden="true" />
              </button>
            ) : (
              <>
                <button type="button" onClick={() => start('register')} className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-sm font-bold text-blue-700 shadow-xl transition hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
                  Start free trial <ArrowRight size={16} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => start('login')} className="rounded-xl border border-white/40 px-7 py-3.5 text-sm font-bold text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
                  I already have a store
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-900/5 py-10">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <div className="space-y-3">
            <LogoLockup onLight />
            <p className="max-w-xs text-xs leading-relaxed text-slate-400">
              The multi-tenant commerce platform and seller PWA built for Ghanaian merchants - POS, payouts, inventory and storefronts in one place.
            </p>
            <p className="text-xs font-bold text-blue-600">
              Every store gets its own address automatically
            </p>
          </div>

          <nav className="space-y-1.5 text-xs font-semibold text-slate-500" aria-label="Product links">
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-charcoal">Product</p>
            {[['features', 'Features'], ['how', 'How it works'], ['stats', 'Why us']].map(([id, label]) => (
              <button key={id} type="button" onClick={() => goTo(id)} className="block transition hover:text-charcoal">{label}</button>
            ))}
            <a href="/login" className="block transition hover:text-charcoal">Seller login</a>
          </nav>

          <nav className="space-y-1.5 text-xs font-semibold text-slate-500" aria-label="Company links">
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-charcoal">Company</p>
            <a href="/about" className="block transition hover:text-charcoal">About Us</a>
            <a href="/contact" className="block transition hover:text-charcoal">Contact Us</a>
          </nav>

          <nav className="space-y-1.5 text-xs font-semibold text-slate-500" aria-label="Legal links">
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-charcoal">Legal</p>
            <a href="/terms" className="block transition hover:text-charcoal">Terms of Service</a>
            <a href="/privacy" className="block transition hover:text-charcoal">Privacy Policy</a>
          </nav>
        </div>
        <p className="mx-auto mt-8 max-w-6xl border-t border-slate-900/5 px-4 pt-6 text-[11px] font-medium text-slate-400 sm:px-6">
          (c) {new Date().getFullYear()} DiDwa · Built for Ghanaian commerce
        </p>
      </footer>

      {/* Mobile slide-in site menu (<768px) */}
      <div
        className={`fixed inset-0 z-50 transition-all duration-300 md:hidden ${menuOpen ? 'visible' : 'invisible pointer-events-none'}`}
        aria-hidden={!menuOpen}
      >
        {/* Scrim - tap to dismiss */}
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
          className={`absolute inset-0 bg-slate-950/50 backdrop-blur-sm transition-opacity duration-300 ${
            menuOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />

        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
          className={`absolute inset-y-0 right-0 flex w-[300px] max-w-[86vw] flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out ${
            menuOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <LogoLockup onLight />
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Site menu">
            <p className="px-2 pb-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Explore</p>
            {[['features', 'Features'], ['how', 'How it works'], ['stats', 'Why us']].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => { setMenuOpen(false); goTo(id); }}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-mist hover:text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {label} <ChevronRight size={15} className="text-slate-300" aria-hidden="true" />
              </button>
            ))}

            <p className="px-2 pb-1 pt-5 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Company</p>
            <a href="/about" onClick={() => setMenuOpen(false)} className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-mist hover:text-charcoal">
              About Us <ChevronRight size={15} className="text-slate-300" aria-hidden="true" />
            </a>
            <a href="/contact" onClick={() => setMenuOpen(false)} className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-mist hover:text-charcoal">
              Contact Us <ChevronRight size={15} className="text-slate-300" aria-hidden="true" />
            </a>
          </nav>

          <div className="space-y-2.5 border-t border-slate-100 p-4">
            {authed ? (
              <button
                type="button"
                onClick={() => { setMenuOpen(false); dashboard(); }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                Open dashboard <ArrowRight size={15} aria-hidden="true" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); start('login'); }}
                  className="w-full rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-600 transition hover:border-slate-300 hover:text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); start('register'); }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  Start free trial <ArrowRight size={15} aria-hidden="true" />
                </button>
              </>
            )}
            <p className="pt-1 text-center text-[10px] font-semibold text-slate-400">14-day free trial · No card required</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
