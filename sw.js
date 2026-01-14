const CACHE_NAME = 'mydoc-v3';
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
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
