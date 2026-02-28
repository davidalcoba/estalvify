// Estalvify Service Worker — minimal PWA support
// Caches the app shell for offline access
// More sophisticated caching strategies can be added later

const CACHE_NAME = "estalvify-v1";

// Files to cache for offline access
const PRECACHE_URLS = ["/", "/dashboard", "/offline"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Clean up old caches
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Only handle GET requests
  if (event.request.method !== "GET") return;

  // Skip API calls and auth routes — always fetch fresh
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth")) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      // Return cached version if available, otherwise fetch
      return cached ?? fetch(event.request);
    })
  );
});
