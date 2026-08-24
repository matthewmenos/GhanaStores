/**
 * Seller authentication - register (auto 14-day trial) or login.
 * Zero-upfront onboarding: only shop name, email, phone, password.
 *
 * Modern split layout: dark brand rail (lg+) beside a focused form column
 * with icon-led inputs, password reveal toggle, live strength meter and
 * accessible alerts. Auth flow is unchanged (register auto-starts the
 * 14-day trial; login exchanges credentials for a session token).
 *
 * STRICT RULE: pure SVG / Lucide React icons ONLY - ZERO emojis.
 */
import { useMemo, useState } from 'react';
import { api, setSession } from '../api.js';
import {
  AlertCircle, ArrowRight, Eye, EyeOff, Lock,
  LogIn, Mail, Phone, ShieldCheck, Store, UserPlus, Zap,
} from 'lucide-react';
import { LogoLockup, IconSpinner } from '../components/icons.jsx';

/* --------------------------------- Atoms ---------------------------------- */
const labelCls = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500';
const inputCls =
  'w-full rounded-xl border border-slate-200 bg-mist/60 py-2.5 pl-10 pr-11 text-sm text-charcoal placeholder:text-slate-400 transition focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100';

/** Text input with a leading icon. */
function Field({ id, label, icon: Icon, children }) {
  return (
    <div>
      <label className={labelCls} htmlFor={id}>{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
          <Icon size={16} aria-hidden="true" />
        </span>
        {children}
      </div>
    </div>
  );
}

/* Live password strength: 0 weak .. 3 strong (null = nothing typed). */
function StrengthMeter({ password }) {
  const score = useMemo(() => {
    const p = password;
    if (!p) return null;
    let s = 0;
    if (p.length >= 8) s = 1;
    if (s === 1 && /[A-Z]/.test(p) && /\d/.test(p)) s = 2;
    if (s === 2 && (p.length >= 12 || /[^A-Za-z0-9]/.test(p))) s = 3;
    return s;
  }, [password]);

  if (score === null) return null;
  const meta = [
    { label: 'Too weak', bar: 'bg-red-500', text: 'text-red-500' },
    { label: 'Weak', bar: 'bg-red-400', text: 'text-red-500' },
    { label: 'Good', bar: 'bg-amber-brand', text: 'text-amber-600' },
    { label: 'Strong', bar: 'bg-emerald-brand', text: 'text-emerald-700' },
  ][score];
  const filled = score === 0 ? 1 : score;

  return (
    <div className="mt-2 flex items-center gap-2" aria-live="polite">
      <div className="flex flex-1 gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i < filled ? meta.bar : 'bg-slate-200'}`} />
        ))}
      </div>
      <span className={`w-16 text-right text-[10px] font-extrabold uppercase tracking-wide ${meta.text}`}>
        {meta.label}
      </span>
    </div>
  );
}

/* Brand-rail selling points (lg+ panel). */
const FEATURES = [
  { Icon: Zap, text: 'Instant Mobile Money payouts - MTN, Telecel, AT' },
  { Icon: Store, text: 'Offline POS with rider cash reconciliation' },
  { Icon: Mail, text: 'WhatsApp orders with PDF receipts' },
];

export default function AuthScreen({ onAuthed, initialMode = 'register' }) {
  const [mode, setMode] = useState(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [acceptsTerms, setAcceptsTerms] = useState(false);
  const [form, setForm] = useState({
    name: '', ownerName: '', email: '', phone: '', password: '',
  });

  function set(k) {
    return (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  }

  function switchMode(m) {
    setMode(m);
    setError('');
    setShowPw(false); // never carry revealed state across modes
    setForm((f) => ({ ...f, password: '' }));
  }

  async function submit(e) {
    e.preventDefault();
    /* Registration requires explicit consent to the legal documents. */
    if (mode === 'register' && !acceptsTerms) {
      setError('Please accept the Terms of Service and Privacy Policy to create your store.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const path = mode === 'register' ? '/api/billing/register' : '/api/billing/login';
      /* Consent flags ride along on registration (server stores them with
         the merchant record once its schema gains consent columns). */
      const payload = mode === 'register'
        ? { ...form, accepts_terms: true, accepted_at: new Date().toISOString() }
        : form;
      const data = await api.post(path, payload);
      setSession(data.token, data.store);
      onAuthed(data.store);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-white">
      {/* Brand rail - desktop only */}
      <aside className="relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden bg-[#0B1120] p-10 text-white lg:flex xl:p-14">
        {/* Ambient glow + dot-grid texture */}
        <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-blue-600/30 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-20 bottom-10 h-80 w-80 rounded-full bg-emerald-brand/20 blur-3xl" aria-hidden="true" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '22px 22px' }}
          aria-hidden="true"
        />

        <div className="relative"><LogoLockup /></div>

        <div className="relative space-y-7">
          <h2 className="text-3xl font-extrabold leading-tight xl:text-4xl">
            Sell everywhere.
            <br />
            Get paid instantly.
          </h2>
          <ul className="space-y-4">
            {FEATURES.map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm font-medium text-slate-300">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <Icon size={15} className="text-emerald-400" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative flex items-center gap-2 text-xs font-semibold text-slate-400">
          <ShieldCheck size={14} className="shrink-0 text-emerald-400" aria-hidden="true" />
          Bank-grade encryption · Mobile Money rails you already trust
        </p>
      </aside>

      {/* Form column */}
      <main className="relative flex min-h-screen w-full flex-col items-center justify-center px-4 py-12 sm:px-8 lg:w-[56%]">
        <div className="w-full max-w-md">
          {/* Compact logo for small screens where the rail is hidden */}
          <div className="mb-8 flex justify-center lg:hidden"><LogoLockup /></div>

          <div className="rounded-3xl border border-slate-100 bg-white p-7 shadow-card ring-1 ring-slate-900/5 sm:p-8">
            {/* Mode switch */}
            <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-mist p-1" role="tablist" aria-label="Authentication mode">
              {[
                { key: 'register', label: 'Start Free Trial', Icon: UserPlus },
                { key: 'login', label: 'Seller Login', Icon: LogIn },
              ].map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={mode === key}
                  onClick={() => switchMode(key)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition ${
                    mode === key ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:text-charcoal'
                  }`}
                >
                  <Icon size={14} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>

            <h1 className="text-xl font-extrabold text-charcoal">
              {mode === 'register' ? 'Launch your store in seconds' : 'Welcome back'}
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              {mode === 'register'
                ? '14 days free. No card required.'
                : 'Sign in to your Ghana Stores dashboard.'}
            </p>

            {error && (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">
                <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={submit} className="mt-5 space-y-4" autoComplete="on">
              {mode === 'register' && (
                <>
                  <Field id="shop" label="Shop name" icon={Store}>
                    <input
                      id="shop"
                      type="text"
                      className={inputCls}
                      value={form.name}
                      onChange={set('name')}
                      placeholder="Ama's Fashion Hub"
                      required
                      maxLength={60}
                      autoComplete="organization"
                    />
                  </Field>
                  <Field id="phone" label="Ghana mobile number" icon={Phone}>
                    <input
                      id="phone"
                      type="tel"
                      className={inputCls}
                      value={form.phone}
                      onChange={set('phone')}
                      placeholder="0244123456"
                      required
                      maxLength={13}
                      autoComplete="tel-national"
                    />
                  </Field>
                </>
              )}

              <Field id="email" label="Email" icon={Mail}>
                <input
                  id="email"
                  type="email"
                  className={inputCls}
                  value={form.email}
                  onChange={set('email')}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </Field>

              {/* Password with reveal toggle */}
              <div>
                <label className={labelCls} htmlFor="password">Password</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <Lock size={16} aria-hidden="true" />
                  </span>
                  <input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    className={inputCls}
                    value={form.password}
                    onChange={set('password')}
                    placeholder="At least 8 characters"
                    required
                    minLength={8}
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    aria-pressed={showPw}
                    title={showPw ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    {showPw ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                  </button>
                </div>
                <StrengthMeter password={form.password} />
              </div>

              {/* Required legal consent - registration only */}
              {mode === 'register' && (
                <label className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs leading-relaxed transition ${
                  acceptsTerms ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-mist/60'
                }`}>
                  <input
                    type="checkbox"
                    checked={acceptsTerms}
                    onChange={(e) => setAcceptsTerms(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-blue-600"
                  />
                  <span className="text-slate-500">
                    I have read and accept the{' '}
                    <a href="#/terms" target="_blank" rel="noreferrer" className="font-bold text-blue-600 underline decoration-blue-200 hover:text-blue-700">Terms of Service</a>
                    {' '}and{' '}
                    <a href="#/privacy" target="_blank" rel="noreferrer" className="font-bold text-blue-600 underline decoration-blue-200 hover:text-blue-700">Privacy Policy</a>, including how my business data is processed.
                  </span>
                </label>
              )}

              <button
                type="submit"
                disabled={busy || (mode === 'register' && !acceptsTerms)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:from-blue-700 hover:to-blue-600 hover:shadow-blue-600/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy && <IconSpinner size={18} />}
                {mode === 'register' ? 'Create my store - free' : 'Sign in'}
                {!busy && <ArrowRight size={16} aria-hidden="true" />}
              </button>
            </form>

            {/* Compact feature recap where the brand rail is hidden */}
            <ul className="mt-6 space-y-2 border-t border-slate-100 pt-5 text-xs text-slate-400 lg:hidden">
              {['Instant MoMo payouts (MTN, Telecel, AT)',
                'Offline POS + rider cash reconciliation',
                'WhatsApp orders with PDF receipts'].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <ShieldCheck size={14} className="shrink-0 text-emerald-brand" aria-hidden="true" /> {f}
                  </li>
              ))}
            </ul>

          </div>

          <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-400">
            Secured by Ghana Stores. By continuing you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </main>
    </div>
  );
}
