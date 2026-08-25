import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev server runs on 3000 to match the FastAPI backend's default CORS
// origin (CORS_ORIGINS defaults to http://localhost:3000 — see
// src/monkey_brain/api/main.py). The /api proxy means the frontend can
// use relative paths in dev and never actually needs CORS to be
// configured correctly; it also transparently proxies WebSocket
// upgrades (ws: true) so ws://localhost:3000/api/... reaches the real
// backend the same way a REST call does.
export default defineConfig({
  plugins: [react()],
  // maplibre-gl spawns its tile-processing work via a real Web Worker
  // built from a `new URL(...)` reference. Vite's esbuild-based dep
  // pre-bundling rewrites/relocates that reference, so the worker
  // 404s under dev-server pre-bundling — confirmed live (request to
  // node_modules/.vite/deps/maplibre-gl-worker.mjs failed). Excluding
  // it from optimizeDeps makes Vite serve it as native ESM instead,
  // where the worker URL resolves correctly.
  optimizeDeps: {
    exclude: ['maplibre-gl'],
    // mermaid dynamically import()s a per-diagram-type renderer chunk
    // (flowDiagram-*.js etc.) the first time that diagram type is used.
    // Without an explicit include, Vite only discovers and pre-bundles
    // those sub-chunks on first request, mid-session -- a dev server
    // already running when this dependency was added can then serve a
    // request for a chunk hash it optimized under a stale run, which the
    // browser (holding an older import map) 404s/fails to fetch. Listing
    // it here makes Vite pre-bundle it eagerly at server start instead.
    // A plain `rm -rf node_modules/.vite && npm run dev` (or just
    // restarting the dev server once) clears any already-stale cache.
    include: ['mermaid'],
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8031',
        changeOrigin: true,
        ws: true,
      },
      // Root-level health endpoints (src/monkey_brain/api/main.py) live
      // outside the /api/v1/agentos prefix.
      '/live': 'http://localhost:8031',
      '/health': 'http://localhost:8031',
      '/ready': 'http://localhost:8031',
    },
  },
})
