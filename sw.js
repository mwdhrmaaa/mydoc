const CACHE_NAME = 'mydoc-v4';
const ASSETS = [
  './',
  './index.html',
  './src/style.css',
  './src/main.js',
  './src/storage.js',
  './src/sync.js',
  './src/sync-storage.js',
  './manifest.json',
  './icon.png'
];

self.addEventListener('install', (event) => {
  console.log('[SW] Installing version:', CACHE_NAME);
  self.skipWaiting(); // Force active immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching assets');
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating');
  event.waitUntil(
    Promise.all([
      self.clients.claim(), // Take control of all clients
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
