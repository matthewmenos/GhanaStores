/**
 * DiDwa PWA bootstrap.
 * Hash routing keeps deep links working on static hosts without rewrites.
 */
import React, { Component } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

class AppErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><div className="max-w-lg rounded-2xl border border-rose-200 bg-white p-6 text-sm text-rose-700"><h1 className="text-lg font-bold">DiDwa could not load</h1><p className="mt-2">{this.state.error.message || 'An unexpected application error occurred.'}</p><button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">Reload</button></div></main>;
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </React.StrictMode>,
);

/* Progressive Web App: register the offline shell service worker. */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* SW is an enhancement; the app works without it. */
    });
  });
}
