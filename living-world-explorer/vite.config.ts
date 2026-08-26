import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Confirmed live: the proxy's own `configure`/`proxy.on('error', ...)`
// handler below (see server.proxy['/api']) catches ONE class of backend-
// restart-induced EPIPE, but Vite's WS-upgrade proxying has a SEPARATE
// internal error path ("ws proxy socket error") that doesn't route
// through that same handler — a second EPIPE from the same backend
// restart still reached here as an uncaught exception and killed the
// whole dev server. This is the actual, final backstop: only swallows
// EPIPE/ECONNRESET (a dropped proxied connection, exactly what a routine
// backend restart produces), rethrows anything else so a genuine bug
// still crashes loudly instead of being silently hidden.
function isDroppedConnection(err: unknown): err is NodeJS.ErrnoException {
  const code = (err as NodeJS.ErrnoException)?.code
  return code === 'EPIPE' || code === 'ECONNRESET'
}

process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (isDroppedConnection(err)) {
    console.error('[vite] ignored', err.code, '(likely a backend restart):', err.message)
    return
  }
  throw err
})

// Confirmed live: 'uncaughtException' above did NOT catch every instance
// of this same class of crash — Node routes an error surfaced through a
// rejected Promise (as opposed to a synchronous throw) to
// 'unhandledRejection' instead, a genuinely separate event with its own
// default-fatal behavior. http-proxy's ws-upgrade path evidently hits
// both surfaces depending on exactly where in the pipe the write fails.
process.on('unhandledRejection', (reason: unknown) => {
  if (isDroppedConnection(reason)) {
    console.error('[vite] ignored', reason.code, '(likely a backend restart, via unhandledRejection)')
    return
  }
  throw reason
})

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
        // Confirmed live: restarting the backend mid-session (a routine
        // dev-loop action) killed the proxied WS connection out from
        // under this, and http-proxy's raw socket 'error' event (EPIPE)
        // had no listener — Node's default behavior for an unhandled
        // 'error' event is to throw, which crashed the entire Vite dev
        // server, not just this one connection. A backend restart should
        // degrade this one proxy connection, never take the frontend
        // down with it.
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.error('[vite proxy] backend connection error (is it restarting?):', err.message)
          })
        },
      },
      // Root-level health endpoints (src/monkey_brain/api/main.py) live
      // outside the /api/v1/agentos prefix.
      '/live': 'http://localhost:8031',
      '/health': 'http://localhost:8031',
      '/ready': 'http://localhost:8031',
    },
  },
})
