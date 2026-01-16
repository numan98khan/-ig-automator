// Legal AI PWA Service Worker
// IMPORTANT: Update cache version when deploying to force refresh
const CACHE_VERSION = 'v1.4.1'; // UPDATE THIS ON EACH DEPLOYMENT
const CACHE_NAME = `legal-ai-${CACHE_VERSION}`;

// Install service worker and cache assets
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing new version:', CACHE_VERSION);
  // Force the waiting service worker to become the active service worker immediately
  self.skipWaiting();
});

// Fetch strategy: Network-first for HTML, Cache-first for assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // IMPORTANT: Only cache GET requests (POST, PUT, DELETE cannot be cached)
  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }

  // Skip caching for API requests (let them go directly to network)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  // For navigation requests (HTML pages), always try network first
  if (request.mode === 'navigate' || request.destination === 'document' ||
      url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone and cache the fresh response
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          // If network fails, try cache
          return caches.match(request);
        })
    );
    return;
  }

  // For other requests (JS, CSS, images), use cache-first strategy
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request).then((response) => {
          // Don't cache if not a valid response
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }

          // Clone and cache for future use
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });

          return response;
        });
      })
  );
});

// Clean up old caches on activation
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating new version:', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[ServiceWorker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all pages immediately
      return self.clients.claim();
    })
  );
});

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

