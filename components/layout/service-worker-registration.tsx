"use client";

// Register the service worker for PWA support
// Must be a client component since it runs browser-side code

import { useEffect } from "react";

function activateWaiting(registration: ServiceWorkerRegistration) {
  if (registration.waiting) {
    // Tell the waiting SW to skip waiting and activate immediately.
    // The SW itself also calls skipWaiting() in its install handler,
    // but posting the message handles the case where it didn't fire.
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  }
}

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        // Force an update check on every page load so stale SWs are replaced
        // as soon as the new sw.js is deployed, without waiting 24h.
        registration.update();

        // Activate any SW that installed but is still waiting.
        activateWaiting(registration);

        // When a new SW finishes installing, activate it immediately too.
        registration.addEventListener("updatefound", () => {
          const next = registration.installing;
          if (!next) return;
          next.addEventListener("statechange", () => {
            if (next.state === "installed") activateWaiting(registration);
          });
        });
      })
      .catch((error) => {
        console.error("SW registration failed:", error);
      });
  }, []);

  return null;
}
