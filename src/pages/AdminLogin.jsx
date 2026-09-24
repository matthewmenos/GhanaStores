/** Separate platform administrator sign-in. Uses the admin session token only. */
import { useState } from 'react';
import { Activity, AlertCircle, Loader2, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { adminApi, setAdminSession } from '../api.js';

export default function AdminLogin({ onAuthed }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const result = await adminApi.post('/api/admin/login', { email, password });
      setAdminSession(result.token, result.admin);
      onAuthed(result.admin);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4"><section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-7 shadow-2xl shadow-black/30"><div className="flex items-center gap-3"><span className="rounded-xl bg-blue-600 p-2.5 text-white"><ShieldCheck size={24} /></span><div><h1 className="text-xl font-extrabold text-white">DiDwa Super Admin</h1><p className="flex items-center gap-1 text-xs text-emerald-400"><Activity size={12} /> Secure platform access</p></div></div><form onSubmit={submit} className="mt-8 space-y-4"><label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Administrator email</span><span className="relative block"><Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input required type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-10 pr-3 text-sm text-white outline-none focus:border-blue-500" placeholder="admin@didwaghana.com" /></span></label><label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Password</span><span className="relative block"><LockKeyhole size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-10 pr-3 text-sm text-white outline-none focus:border-blue-500" placeholder="Your password" /></span></label>{error && <p className="flex items-center gap-2 rounded-lg border border-rose-800 bg-rose-950/50 px-3 py-2 text-sm text-rose-300"><AlertCircle size={15} />{error}</p>}<button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" />}{busy ? 'Signing in...' : 'Sign in to Super Admin'}</button></form><p className="mt-6 text-center text-xs text-slate-500">Platform administrators use a separate session from sellers.</p></section></main>;
}
