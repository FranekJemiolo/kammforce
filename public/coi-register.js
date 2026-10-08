/* Registers the combined Workbox + COOP/COEP service worker (sw.js) and reloads once
 * so the page itself becomes cross-origin isolated (required for SharedArrayBuffer / OPFS).
 * Classic script on purpose: it must run before the app bundle. */
(function () {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) {
    console.warn('[coi] Secure context + service workers required for OPFS; falling back to in-memory DB.');
    return;
  }
  var script = document.currentScript;
  var swUrl = new URL('sw.js', script ? script.src : location.href).href;

  // Guard against reload loops (e.g. browser blocks SW or headers never apply).
  var KEY = 'coi-reloaded';
  navigator.serviceWorker
    .register(swUrl)
    .then(function (reg) {
      // Proactively check for updates on every page load
      reg.update().catch(function () {});

      reg.addEventListener('updatefound', function () {
        console.log('[coi] service worker update found');
        var newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', function () {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[coi] new version ready, reloading to update');
              window.location.reload();
            }
          });
        }
      });

      if (!window.crossOriginIsolated && reg.active && !navigator.serviceWorker.controller && !sessionStorage.getItem(KEY)) {
        sessionStorage.setItem(KEY, '1');
        window.location.reload();
      }
    })
    .catch(function (e) {
      console.error('[coi] service worker registration failed', e);
    });

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!sessionStorage.getItem(KEY)) {
      sessionStorage.setItem(KEY, '1');
      window.location.reload();
    }
  });
})();
