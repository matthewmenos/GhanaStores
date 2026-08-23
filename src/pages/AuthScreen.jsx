/**
 * Seller authentication - register (auto 14-day trial) or login.
 * Zero-upfront onboarding: only shop name, email, phone, password.
 */
import { useState } from 'react';
import { api, setSession } from '../api.js';
import { LogoLockup, IconStore, IconSpinner, IconCheck } from '../components/icons.jsx';

const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-charcoal placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';
const labelCls = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500';

export default function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState('register');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', ownerName: '', email: '', phone: '', password: '',
  });

  function set(k) {
    return (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const path = mode === 'register' ? '/api/billing/register' : '/api/billing/login';
      const data = await api.post(path, form);
      setSession(data.token, data.store);
      onAuthed(data.store);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <LogoLockup />
        </div>

        <div className="rounded-3xl bg-white p-7 shadow-2xl">
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-mist p-1">
            {['register', 'login'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(''); }}
                className={`rounded-lg py-2 text-sm font-semibold transition ${
                  mode === m ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:text-charcoal'
                }`}
              >
                {m === 'register' ? 'Start Free Trial' : 'Seller Login'}
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
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">
              <IconStore size={16} /> {error}
            </div>
          )}

          <form onSubmit={submit} className="mt-5 space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className={labelCls} htmlFor="shop">Shop name</label>
                  <input id="shop" className={inputCls} value={form.name} onChange={set('name')}
                    placeholder="Ama's Fashion Hub" required maxLength={60} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="phone">Ghana mobile number</label>
                  <input id="phone" className={inputCls} value={form.phone} onChange={set('phone')}
                    placeholder="0244123456" required maxLength={13} />
                </div>
              </>
            )}
            <div>
              <label className={labelCls} htmlFor="email">Email</label>
              <input id="email" type="email" className={inputCls} value={form.email}
                onChange={set('email')} placeholder="you@example.com" required />
            </div>
            <div>
              <label className={labelCls} htmlFor="password">Password</label>
              <input id="password" type="password" className={inputCls} value={form.password}
                onChange={set('password')} placeholder="At least 8 characters" required minLength={8} />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? <IconSpinner size={18} /> : mode === 'register' ? <IconCheck size={18} /> : null}
              {mode === 'register' ? 'Create my store - free' : 'Sign in'}
            </button>
          </form>

          <ul className="mt-6 space-y-2 text-xs text-slate-400">
            {['Instant Mobile Money payouts (MTN, Telecel, AT)',
              'Offline POS + rider cash reconciliation',
              'WhatsApp orders with PDF receipts'].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <IconCheck size={14} className="text-emerald-brand shrink-0" /> {f}
                </li>
              ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
