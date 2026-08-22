import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Ghana Stores — Seller Dashboard',
        short_name: 'Ghana Stores',
        description: 'Sell online, in-store, and on WhatsApp — built for Ghanaian merchants.',
        theme_color: '#2563EB',
        background_color: '#0F172A',
        display: 'standalone',
        start_url: '/dashboard',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // POS must keep logging cash sales while offline — cache-first for
        // the app shell, network-first for API calls that need freshness.
        runtimeCaching: [
          {
            urlPattern: /\/api\/inventory\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'inventory-cache', networkTimeoutSeconds: 4 },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
