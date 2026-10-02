// Cache hors-ligne : incrémente VERSION à chaque mise à jour du jeu.
const VERSION = 'pm-v36';
const FILES = ['./', 'index.html', 'style.css', 'game.js', 'faces.js', 'fiches.js', 'app.js', 'oral.js', 'fx.js', 'online.js', 'firebase-config.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Réseau d'abord (pour recevoir les mises à jour), cache si hors-ligne
self.addEventListener('fetch', e => {
  // Seulement les fichiers du jeu : Firebase (base de données, connexion) passe directement par le réseau
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
