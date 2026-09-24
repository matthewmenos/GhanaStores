/**
 * DiDwa PWA bootstrap.
 * Hash routing keeps deep links working on static hosts without rewrites.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
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
