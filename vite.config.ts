import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves project sites from /<repo>/ — must match the repo name.
const base = '/kammforce/';

export default defineConfig({
  base,
  plugins: [
    vue(),
    // NOTE: a page can only have ONE service worker per scope. coi-serviceworker's
    // stock file and Workbox's generated SW would fight over it, so we build a single
    // custom SW (src/sw.ts) that does Workbox precaching AND the COOP/COEP header
    // injection (the same logic coi-serviceworker uses). public/coi-register.js
    // registers it and reloads once so the document itself gets the headers.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false,
      registerType: 'autoUpdate',
      manifest: {
        name: 'KammForce',
        short_name: 'KammForce',
        description: 'Offline motorcycle grip and lean-limit calculator',
        theme_color: '#0b0f17',
        background_color: '#0b0f17',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,wasm,yaml,sqlite3}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  // Dev server sends the isolation headers directly so OPFS works under `npm run dev`.
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  // Keep sqlite-wasm out of dep pre-bundling so it can locate its .wasm / OPFS proxy worker.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es' },
});
