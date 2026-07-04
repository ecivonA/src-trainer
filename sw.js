// Version hochzählen bei jeder Änderung an HTML/JS/CSS
const CACHE = 'skat-v2.17';

const FONT_CACHE = 'skat-fonts-v1';

const CORE_FILES = [
  './',
  './index.html',
  './style.css',
  './lang.js',
  './calc.js',
  './ui.js',
  './app.js',
  './manifest.json',
];

const FONT_FILES = [
  './fonts/playfair-display-v40-latin-700.woff2',
  './fonts/playfair-display-v40-latin-900.woff2',
  './fonts/source-code-pro-v31-latin-regular.woff2',
  './fonts/source-code-pro-v31-latin-600.woff2',
  './icon-192.png',
  './icon-512.png',
];

// Install: Core-Dateien und Fonts vorab cachen
self.addEventListener('install', e => {
  e.waitUntil(
    Promise.all([
      caches.open(CACHE).then(c => c.addAll(CORE_FILES)),
      caches.open(FONT_CACHE).then(c => c.addAll(FONT_FILES)),
    ])
  );
  self.skipWaiting(); // Sofort aktiv, kein Warten auf Tab-Schließen
});

// Activate: alle alten Core-Caches löschen (Fonts behalten)
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE && k !== FONT_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim()) // Alle Tabs sofort übernehmen
  );
});

// Fetch: Network First für Core, Cache First für Fonts/Icons
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Fonts + Icons: Cache First (ändern sich nie)
  const isFont = url.pathname.includes('/fonts/') ||
                 url.pathname.endsWith('icon-192.png') ||
                 url.pathname.endsWith('icon-512.png');
  if (isFont) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
    return;
  }

  // Core (HTML/JS/CSS): Network First, Cache als Fallback (offline)
  e.respondWith(
    fetch(e.request)
      .then(response => {
        // Frische Version in Cache schreiben
        const clone = response.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return response;
      })
      .catch(() => caches.match(e.request)) // Offline: Cache-Fallback
  );
});
