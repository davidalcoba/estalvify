"use client";

// Opt this device in or out of Web Push.
//
// The permission request must come from a real click — browsers reject
// Notification.requestPermission() outside a user gesture, and Chrome
// permanently blocks origins that ask on page load.
//
// The iOS caveat drives most of this component: Safari only exposes push to
// PWAs added to the Home Screen. In a browser tab `PushManager` is missing
// entirely, so rather than a button that cannot work we explain the install
// step — which components/layout/install-prompt.tsx walks the user through.

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  savePushSubscription,
  deletePushSubscription,
} from "@/app/(app)/settings/actions";

/**
 * Whether we are past hydration. Everything below depends on `window`, so it
 * can only be read on the client; setting a flag from an effect would be a
 * cascading render (and trips react-hooks/set-state-in-effect).
 */
const neverChanges = () => () => {};
function useIsClient(): boolean {
  return useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari predates display-mode and exposes its own flag.
    (navigator as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * The VAPID public key travels as URL-safe base64 but must reach
 * pushManager.subscribe as bytes.
 */
function decodeVapidKey(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  // Filled by hand rather than Uint8Array.from: that returns an
  // ArrayBufferLike-backed view, which subscribe() rejects.
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function PushToggle({ subscribed }: { subscribed: boolean }) {
  const [enabled, setEnabled] = useState(subscribed);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isClient = useIsClient();

  // Reconcile with the browser: the row can outlive the real subscription
  // (permission revoked in OS settings, site data cleared) and vice versa.
  useEffect(() => {
    let cancelled = false;
    async function sync() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (!cancelled) setEnabled(Boolean(existing));
    }
    void sync();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setError("Notifications are blocked. Allow them in browser settings.");
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      // Payloads are encrypted anyway, but Chrome requires this to be true.
      userVisibleOnly: true,
      applicationServerKey: decodeVapidKey(VAPID_PUBLIC_KEY),
    });

    const json = subscription.toJSON();
    await savePushSubscription({
      endpoint: subscription.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
      userAgent: navigator.userAgent,
    });
    setEnabled(true);
  }

  async function disable() {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      await deletePushSubscription(subscription.endpoint);
    }
    setEnabled(false);
  }

  function handleChange(next: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        await (next ? enable() : disable());
      } catch (cause) {
        console.error("[push] toggle failed:", cause);
        setError(
          next
            ? "Could not enable notifications."
            : "Could not disable notifications.",
        );
      }
    });
  }

  // Render the server's view until hydration so the markup matches.
  const supported = !isClient || "PushManager" in window;
  const needsInstall = isClient && isIos() && !isStandalone();
  // Without a key there is nothing to subscribe against, so say so instead of
  // offering a switch that throws on click.
  const notConfigured = !VAPID_PUBLIC_KEY;
  const blocked = needsInstall || !supported || notConfigured;

  const reason = needsInstall
    ? "On iPhone, add Estalvify to your Home Screen first."
    : !supported
      ? "This browser doesn't support push notifications."
      : notConfigured
        ? "Push is not configured on this deployment."
        : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Push notifications</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="push-toggle" className="font-normal">
            Budget and recurring alerts, on this device.
          </Label>
          <Switch
            id="push-toggle"
            checked={enabled}
            onCheckedChange={handleChange}
            disabled={isPending || blocked}
          />
        </div>
        {reason && <p className="text-xs text-muted-foreground">{reason}</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
