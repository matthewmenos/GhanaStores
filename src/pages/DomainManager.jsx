/**
 * Ghana Stores - Unified Domain Management Dashboard
 * Flow A: Connect Existing Domain (BYOD via Cloudflare for SaaS)
 * Flow B: Buy New Domain (Openprovider + Hubtel MoMo/Card checkout)
 *
 * STRICT RULE: pure SVG / Lucide React icons ONLY - ZERO emojis.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ghs } from '../api.js';
import {
  CheckCircle2, ChevronRight, Copy, CreditCard, ExternalLink,
  Globe, Link2, Loader2, RefreshCw, Search, ShoppingCart,
  XCircle, X, Mail, Phone, Shield, Clock,
} from 'lucide-react';

/* =========================================================================
 * Constants
 * ========================================================================= */

const PLATFORM_DOMAIN = import.meta.env.VITE_PLATFORM_DOMAIN || 'ghastores.com';

const DOMAIN_RE = /^(\*\.)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

/* =========================================================================
 * Utility: copy to clipboard
 * ========================================================================= */

function useCopyToClipboard() {
  const [copied, setCopied] = useState(null);
  const timeoutRef = useRef(null);

  const copy = useCallback((text, label) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      timeoutRef.current = setTimeout(() => setCopied(null), 2000);
    }).catch(() => {
      // Fallback for non-secure contexts
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(label);
      timeoutRef.current = setTimeout(() => setCopied(null), 2000);
    });
  }, []);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  return { copied, copy };
}

/* =========================================================================
 * Reusable: Section Card
 * ========================================================================= */

function Card({ children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-card ${className}`}>
      {children}
    </div>
  );
}

/* =========================================================================
 * Primary Subdomain Header Card
 * ========================================================================= */

function PrimaryDomainCard({ subdomain }) {
  const primaryUrl = `https://${subdomain}.${PLATFORM_DOMAIN}`;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50">
            <Globe size={20} className="text-emerald-600" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-charcoal">{subdomain}.{PLATFORM_DOMAIN}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                <CheckCircle2 size={11} aria-hidden="true" />
                Primary Route
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">Your persistent system address</p>
          </div>
        </div>
        <a
          href={primaryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-charcoal sm:self-auto"
        >
          <ExternalLink size={13} aria-hidden="true" />
          Visit Store
        </a>
      </div>
    </Card>
  );
}

/* =========================================================================
 * Tab 1: Connect Existing Domain (BYOD)
 * ========================================================================= */

function ConnectExistingTab() {
  const [domainInput, setDomainInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const { copied, copy } = useCopyToClipboard();

  const isValidFormat = DOMAIN_RE.test(domainInput.trim());

  async function handleConnect(e) {
    e.preventDefault();
    setError('');
    setResult(null);
    if (!domainInput.trim()) { setError('Enter a domain name to connect.'); return; }
    if (!isValidFormat) { setError('Enter a valid domain, e.g. mybrand.com or www.mybrand.com'); return; }
    setBusy(true);
    try {
      const res = await api.post('/api/domains/connect-existing', { domainName: domainInput.trim() });
      setResult(res);
    } catch (err) {
      setError(err.message || 'Failed to connect domain.');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    if (!result?.domainName) return;
    setVerifying(true);
    setError('');
    try {
      const res = await api.get(`/api/domains/verify-status?domain=${encodeURIComponent(result.domainName)}`);
      setResult((prev) => ({ ...prev, status: res.status, ssl: res.ssl, verificationErrors: res.verificationErrors }));
    } catch (err) {
      setError(err.message || 'Verification check failed.');
    } finally {
      setVerifying(false);
    }
  }

  const isPending = result?.status === 'PENDING_DNS';
  const isActive = result?.status === 'ACTIVE';

  return (
    <div className="space-y-5">
      <form onSubmit={handleConnect} className="space-y-3">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="custom-domain">Custom Domain</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><Globe size={16} aria-hidden="true" /></span>
            <input id="custom-domain" type="text" value={domainInput}
              onChange={(e) => { setDomainInput(e.target.value); setError(''); }}
              placeholder="mybrand.com or www.mybrand.com"
              className="w-full rounded-xl border border-slate-200 bg-mist/60 py-2.5 pl-10 pr-3 text-sm text-charcoal placeholder:text-slate-400 transition focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
        </div>
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <XCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" /><span>{error}</span>
          </div>
        )}
        <button type="submit" disabled={busy || !domainInput.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:from-blue-700 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
          {busy ? 'Provisioning...' : 'Connect Domain'}
        </button>
      </form>

      {isPending && result?.dnsTarget && (
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3">
            <h3 className="flex items-center gap-2 text-sm font-bold text-charcoal">
              <Clock size={15} className="text-amber-500" aria-hidden="true" />
              DNS Configuration Required
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">Add these records at your DNS provider, then check connection status.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="border-b border-slate-100 text-slate-500">
                <th className="px-5 py-2.5 font-semibold uppercase tracking-wide">Type</th>
                <th className="px-5 py-2.5 font-semibold uppercase tracking-wide">Host</th>
                <th className="px-5 py-2.5 font-semibold uppercase tracking-wide">Points To</th>
                <th className="px-5 py-2.5 font-semibold uppercase tracking-wide">Action</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                <tr className="transition hover:bg-mist/50">
                  <td className="px-5 py-3"><span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">A</span></td>
                  <td className="px-5 py-3 font-mono text-slate-600">@</td>
                  <td className="px-5 py-3 font-mono text-slate-600">{result.dnsTarget.aRecord}</td>
                  <td className="px-5 py-3">
                    <button type="button" onClick={() => copy(result.dnsTarget.aRecord, 'apex')}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-charcoal">
                      <Copy size={11} aria-hidden="true" />{copied === 'apex' ? 'Copied' : 'Copy'}
                    </button>
                  </td>
                </tr>
                <tr className="transition hover:bg-mist/50">
                  <td className="px-5 py-3"><span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-bold text-purple-700">CNAME</span></td>
                  <td className="px-5 py-3 font-mono text-slate-600">www</td>
                  <td className="px-5 py-3 font-mono text-slate-600">{result.dnsTarget.cnameRecord}</td>
                  <td className="px-5 py-3">
                    <button type="button" onClick={() => copy(result.dnsTarget.cnameRecord, 'www')}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-charcoal">
                      <Copy size={11} aria-hidden="true" />{copied === 'www' ? 'Copied' : 'Copy'}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 px-5 py-3">
            <button type="button" onClick={handleVerify} disabled={verifying}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50">
              {verifying ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={13} aria-hidden="true" />}
              {verifying ? 'Checking...' : 'Check Connection Status'}
            </button>
          </div>
        </Card>
      )}

      {isActive && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
          <CheckCircle2 size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div><span className="font-bold">Domain is active.</span> SSL has been provisioned and your custom domain is live.</div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
 * Hubtel Checkout Drawer (Flow B)
 * ========================================================================= */

function HubtelCheckoutDrawer({ domain, priceGhs, onClose }) {
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleProceed() {
    setError('');
    if (!phone || phone.length < 10) { setError('Enter a valid mobile money phone number.'); return; }
    if (!email || !email.includes('@')) { setError('Enter a valid email address.'); return; }
    setBusy(true);
    try {
      const res = await api.post('/api/domains/buy/initialize-hubtel', {
        amountGhs: priceGhs, domainName: domain, customerPhone: phone, customerEmail: email,
      });
      if (res.checkoutUrl) { window.location.href = res.checkoutUrl; }
      else { setError('Payment gateway did not return a checkout URL.'); }
    } catch (err) { setError(err.message || 'Failed to initialize payment.'); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-charcoal">
            <CreditCard size={16} className="text-blue-600" aria-hidden="true" /> Complete Purchase
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-charcoal" aria-label="Close drawer">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="rounded-xl border border-slate-200 bg-mist/40 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Order Summary</h3>
            <div className="mt-3 space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-600"><Globe size={13} className="text-slate-400" aria-hidden="true" /> Domain</span>
                <span className="font-semibold text-charcoal">{domain}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-600"><Clock size={13} className="text-slate-400" aria-hidden="true" /> Registration</span>
                <span className="text-slate-600">1 Year</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-600"><Shield size={13} className="text-emerald-500" aria-hidden="true" /> SSL Certificate</span>
                <span className="text-emerald-600 font-medium">Free</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-600"><CheckCircle2 size={13} className="text-emerald-500" aria-hidden="true" /> Managed DNS</span>
                <span className="text-emerald-600 font-medium">Included</span>
              </div>
              <div className="border-t border-slate-200 pt-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Total</span>
                  <span className="text-lg font-extrabold text-charcoal">{ghs(priceGhs)}<span className="text-xs font-normal text-slate-400"> / yr</span></span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Payment Details</h3>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500" htmlFor="momo-phone">Mobile Money Phone</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><Phone size={15} aria-hidden="true" /></span>
                <input id="momo-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="233XXXXXXXXX"
                  className="w-full rounded-xl border border-slate-200 bg-mist/60 py-2.5 pl-10 pr-3 text-sm text-charcoal placeholder:text-slate-400 transition focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500" htmlFor="momo-email">Email Address</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><Mail size={15} aria-hidden="true" /></span>
                <input id="momo-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
                  className="w-full rounded-xl border border-slate-200 bg-mist/60 py-2.5 pl-10 pr-3 text-sm text-charcoal placeholder:text-slate-400 transition focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
            </div>
          </div>
          {error && <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"><XCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" /><span>{error}</span></div>}
        </div>
        <div className="border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={handleProceed} disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:from-blue-700 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <CreditCard size={16} aria-hidden="true" />}
            {busy ? 'Initializing...' : `Proceed to Payment (Hubtel) - ${ghs(priceGhs)}`}
          </button>
          <p className="mt-2 text-center text-[10px] text-slate-400">Secured by Hubtel. Supports MTN MoMo, Telecel, AT, and cards.</p>
        </div>
      </div>
    </>
  );
}

/* =========================================================================
 * Tab 2: Buy New Domain
 * ========================================================================= */

function BuyNewDomainTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [checkoutDomain, setCheckoutDomain] = useState(null);
  const [checkoutPrice, setCheckoutPrice] = useState(0);

  async function handleSearch(e) {
    e.preventDefault();
    if (!searchQuery.trim() || searchQuery.trim().length < 2) { setSearchError('Enter at least 2 characters to search.'); return; }
    setSearching(true); setSearchError(''); setSearched(false);
    try {
      const res = await api.get(`/api/domains/search?query=${encodeURIComponent(searchQuery.trim())}`);
      setResults(res.results || []); setSearched(true);
    } catch (err) { setSearchError(err.message || 'Search failed.'); }
    finally { setSearching(false); }
  }

  function handleBuy(domain, priceGhs) { setCheckoutDomain(domain); setCheckoutPrice(priceGhs); }

  return (
    <div className="space-y-5">
      <form onSubmit={handleSearch} className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><Search size={16} aria-hidden="true" /></span>
        <input type="text" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setSearchError(''); }}
          placeholder="Search for your perfect domain name..."
          className="w-full rounded-xl border border-slate-200 bg-mist/60 py-2.5 pl-10 pr-24 text-sm text-charcoal placeholder:text-slate-400 transition focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100" />
        <button type="submit" disabled={searching}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-1.5 text-xs font-bold text-white transition hover:from-blue-700 hover:to-blue-600 disabled:opacity-50">
          {searching ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : 'Search'}
        </button>
      </form>
      {searchError && <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"><XCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" /><span>{searchError}</span></div>}
      {searched && results.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3">
            <h3 className="text-sm font-bold text-charcoal">Available Extensions</h3>
          </div>
          <div className="divide-y divide-slate-50">

            {results.map((r) => (
              <div key={r.domain} className="flex items-center justify-between px-5 py-3.5 transition hover:bg-mist/50">
                <div className="flex items-center gap-3">
                  <Globe size={15} className={r.available ? 'text-emerald-500' : 'text-slate-300'} aria-hidden="true" />
                  <div>
                    <span className="text-sm font-semibold text-charcoal">{r.domain}</span>
                    <div className="mt-0.5">
                      {r.available ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700"><CheckCircle2 size={10} aria-hidden="true" /> Available</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500"><XCircle size={10} aria-hidden="true" /> Unavailable</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {r.available && <span className="text-sm font-bold text-charcoal">{ghs(r.priceGhs)}<span className="text-[10px] font-normal text-slate-400"> / yr</span></span>}
                  {r.available ? (
                    <button type="button" onClick={() => handleBuy(r.domain, r.priceGhs)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 px-3.5 py-1.5 text-xs font-bold text-white transition hover:from-blue-700 hover:to-blue-600">
                      <CreditCard size={12} aria-hidden="true" /> Buy Now
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] font-medium text-slate-400"><XCircle size={12} aria-hidden="true" /> Taken</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      {checkoutDomain && <HubtelCheckoutDrawer domain={checkoutDomain} priceGhs={checkoutPrice} onClose={() => setCheckoutDomain(null)} />}
    </div>
  );
}

/* =========================================================================
 * Main DomainManager Component
 * ========================================================================= */

export default function DomainManager({ subdomain = 'my-store' }) {
  const [activeTab, setActiveTab] = useState('connect');

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-extrabold text-charcoal">
          <Globe size={22} className="text-blue-600" aria-hidden="true" /> Domain Manager
        </h1>
        <p className="mt-1 text-sm text-slate-400">Connect an existing domain or buy a new one for your store.</p>
      </div>
      <PrimaryDomainCard subdomain={subdomain} />
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-mist/60 p-1">
        <button type="button" onClick={() => setActiveTab('connect')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${activeTab === 'connect' ? 'bg-white text-charcoal shadow-card' : 'text-slate-500 hover:text-charcoal'}`}>
          <Link2 size={15} aria-hidden="true" /> Connect Existing Domain
        </button>
        <button type="button" onClick={() => setActiveTab('buy')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${activeTab === 'buy' ? 'bg-white text-charcoal shadow-card' : 'text-slate-500 hover:text-charcoal'}`}>
          <ShoppingCart size={15} aria-hidden="true" /> Buy New Domain
        </button>
      </div>
      {activeTab === 'connect' && <ConnectExistingTab />}
      {activeTab === 'buy' && <BuyNewDomainTab />}
    </div>
  );
}
