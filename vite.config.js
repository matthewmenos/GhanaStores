import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

// Build identity is injected at build time so the running app can report which
// commit it came from. Without this, "is the new build live?" can only be
// answered by comparing bundle hashes in devtools.
function buildMeta() {
  let commit = 'unknown';
  try {
    commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
  } catch { /* not a git checkout (e.g. shallow CI clone) */ }
  return JSON.stringify({ commit, builtAt: new Date().toISOString() });
}

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_META__: buildMeta(),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Split heavy vendors so app code updates do not bust the framework cache.
                manualChunks: {
          charts: ['recharts'],
        },
      },
    },
  },

});
