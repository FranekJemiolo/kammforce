/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

self.addEventListener('install', () => self.skipWaiting());
clientsClaim();

// ---- Cross-origin isolation (same logic as coi-serviceworker) ----
// GitHub Pages cannot set COOP/COEP headers, so every response gets them here.
// This listener MUST be registered before precacheAndRoute(): the first 'fetch'
// listener that calls respondWith() wins, and Workbox's own route would otherwise
// answer precached URLs *without* the isolation headers.
self.addEventListener('fetch', (event) => {
  const r = event.request;
  if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') return;
  if (r.method !== 'GET') return;

  event.respondWith(
    (async () => {
      const sameOrigin = new URL(r.url).origin === self.location.origin;
      let res: Response | undefined;

      if (sameOrigin) {
        // Offline-first for our own assets: precache, then runtime caches, then network.
        res = await matchPrecache(r);
        if (!res && r.mode === 'navigate') {
          res = await matchPrecache(new URL('index.html', self.registration.scope).href);
        }
      }
      res ??= (await caches.match(r)) ?? (await fetch(r));

      if (res.status === 0) return res; // opaque response cannot be re-wrapped
      const headers = new Headers(res.headers);
      headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
      headers.set('Cross-Origin-Opener-Policy', 'same-origin');
      headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    })().catch((e) => {
      console.error('[sw] fetch failed', e);
      return Response.error();
    }),
  );
});

// ---- Offline caching (Workbox precache of the build + public/data YAML) ----
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
