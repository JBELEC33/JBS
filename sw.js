// =====================================================================
// Service worker : garde une copie de l'appli sur le téléphone.
// Règle simple : on essaie toujours d'abord la version en ligne (pour avoir
// la dernière mise à jour), et on se rabat sur la copie si pas de réseau.
// Les tuiles de la carte ne sont pas gardées ici (ce sera l'étape 6).
// =====================================================================
const CACHE = 'gps-bordeaux-v4';
const FICHIERS = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'rapports.js',
  'moteur-recherche.js',
  'horaires.js',
  'recherche.js',
  'moteur-itineraire.js',
  'itineraire.js',
  'consignes.js',
  'navigation.js',
  'listes/categories.json',
  'listes/sigles.json',
  'manifest.webmanifest',
  'vendor/maplibre/maplibre-gl.js',
  'vendor/maplibre/maplibre-gl.css',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // Supprime les copies des anciennes versions
  e.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Seulement les fichiers de l'appli elle-même (pas la carte, pas les autres sites)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((reponse) => {
        const copie = reponse.clone();
        if (reponse.ok) caches.open(CACHE).then((c) => c.put(e.request, copie));
        return reponse;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
