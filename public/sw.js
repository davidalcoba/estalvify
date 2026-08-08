// Estalvify Service Worker — minimal PWA support
// Provides an offline fallback page only.
//
// Navigation requests (HTML pages) always go to the network so that
// auth redirects and server-rendered content work correctly. Caching
// entire pages cache-first broke the app: the first visit could cache
// a redirect or error response, causing "This site can't be reached"
// on subsequent visits until the user did a hard reload.

const CACHE_NAME = "estalvify-v4";

self.addEventListener("install", (event) => {
  // Only cache the offline fallback — never cache real app pages.
  //
  // The precache is deliberately allowed to fail: cache.add() rejects on a
  // non-2xx *or redirected* response, and a rejected install means the worker
  // never activates — which silently kills installability, since Chrome needs
  // an active worker with a fetch handler before it offers "Install app".
  // That is exactly what happened while /offline did not exist: the request
  // redirected to /login and Cache.put threw. Degrading to "no offline page"
  // is always better than degrading to "no service worker".
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.add("/offline"))
      .catch(() => {})
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
      fetch(event.request).catch(async () => {
        // The precache is best-effort (see install), so /offline may be absent.
        // respondWith(undefined) would throw, so fall back to a plain response.
        const cached = await caches.match("/offline");
        return (
          cached ??
          new Response("You're offline.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      })
    );
    return;
  }

  // All other requests (JS, CSS, images, fonts, API calls) are handled
  // by the browser's normal HTTP cache — we don't intercept them.
});

// ── Web Push ───────────────────────────────────────────────────────────────
// Payload shape is PushPayload in lib/notifications/push.ts.

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // A malformed payload should still surface something, not nothing.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Estalvify", {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-maskable-512.png",
      // Collapses repeats of the same alert instead of stacking them.
      tag: payload.tag,
      data: { url: payload.url || "/notifications" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/notifications";

  // Focus an existing window rather than opening a duplicate: tapping a
  // notification while the app is already open should navigate it, not spawn
  // a second instance.
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
