// Estalvify Service Worker — minimal PWA support
// Provides an offline fallback page only.
//
// Navigation requests (HTML pages) always go to the network so that
// auth redirects and server-rendered content work correctly. Caching
// entire pages cache-first broke the app: the first visit could cache
// a redirect or error response, causing "This site can't be reached"
// on subsequent visits until the user did a hard reload.

const CACHE_NAME = "estalvify-v3";

self.addEventListener("install", (event) => {
  // Only cache the offline fallback — never cache real app pages.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add("/offline"))
  );
  self.skipWaiting();
});

// Allow the page to force activation of a waiting SW.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Purge all old caches (including v1 which had the bad page cache).
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
  if (event.request.method !== "GET") return;

  // For full-page navigations: network-first, fall back to /offline only when
  // the network is completely unavailable (e.g. airplane mode).
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/offline"))
    );
    return;
  }

  // All other requests (JS, CSS, images, fonts, API calls) are handled
  // by the browser's normal HTTP cache — we don't intercept them.
});
