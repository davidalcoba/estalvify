"use client";

// Opt this device in or out of Web Push, choose which alerts may reach it, and
// prove it works.
//
// The permission request must come from a real click — browsers reject
// Notification.requestPermission() outside a user gesture, and Chrome
// permanently blocks origins that ask on page load.
//
// The iOS caveat drives the gating: Safari only exposes push to PWAs added to
// the Home Screen. In a browser tab `PushManager` is missing entirely, so
// rather than a control that cannot work we explain the install step, which
// components/layout/install-prompt.tsx walks the user through.

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { NotificationType } from "@/app/generated/prisma";
import {
  savePushSubscription,
  deletePushSubscription,
  updatePushTypes,
  sendTestPush,
} from "@/app/(app)/settings/actions";
import { useT } from "@/components/i18n/i18n-provider";

/**
 * The alerts a member can route to their phone, in order of urgency. The
 * label is looked up as `settings.push.type.<TYPE>`, so adding a
 * NotificationType here without its message is a type error.
 */
const PUSH_TYPES = [
  "LOW_BALANCE_PROJECTED",
  "CONSENT_EXPIRING",
  "NO_TRANSACTIONS",
  "RECURRING_UPCOMING",
  "RECURRING_AMOUNT_CHANGE",
  "RECURRING_MISSED",
] as const satisfies readonly NotificationType[];

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
    (navigator as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** The VAPID public key travels as URL-safe base64 but subscribe() needs bytes. */
function decodeVapidKey(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function PushToggle({
  subscribed,
  types,
  lastError,
}: {
  subscribed: boolean;
  types: NotificationType[];
  /** Why the last send to this member's devices failed, if it did. */
  lastError: string | null;
}) {
  const [enabled, setEnabled] = useState(subscribed);
  const [selected, setSelected] = useState<NotificationType[]>(types);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isClient = useIsClient();
  const t = useT();

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
      setError(t("settings.push.blocked"));
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
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

    // Turning it on with nothing selected would be a switch that does nothing,
    // so default to every alert; the member can pare it back below.
    if (selected.length === 0) {
      const all = [...PUSH_TYPES];
      setSelected(all);
      await updatePushTypes(all);
    }
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

  function toggleAll(next: boolean) {
    setError(null);
    setTestResult(null);
    startTransition(async () => {
      try {
        await (next ? enable() : disable());
      } catch (cause) {
        console.error("[push] toggle failed:", cause);
        setError(
          next ? t("settings.push.enableFailed") : t("settings.push.disableFailed"),
        );
      }
    });
  }

  function toggleType(type: NotificationType, on: boolean) {
    const next = on
      ? [...selected, type]
      : selected.filter((candidate) => candidate !== type);
    setSelected(next);
    startTransition(async () => {
      await updatePushTypes(next);
    });
  }

  function runTest() {
    setTestResult(null);
    startTransition(async () => {
      const result = await sendTestPush();
      setTestResult(result.message);
    });
  }

  // Render the server's view until hydration so the markup matches.
  const supported = !isClient || "PushManager" in window;
  const needsInstall = isClient && isIos() && !isStandalone();
  const notConfigured = !VAPID_PUBLIC_KEY;
  const blocked = needsInstall || !supported || notConfigured;

  const reason = needsInstall
    ? t("settings.push.needsInstall")
    : !supported
      ? t("settings.push.unsupported")
      : notConfigured
        ? t("settings.push.notConfigured")
        : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.push.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="push-toggle" className="font-normal">
            {t("settings.push.deviceLabel")}
          </Label>
          <Switch
            id="push-toggle"
            checked={enabled}
            onCheckedChange={toggleAll}
            disabled={isPending || blocked}
          />
        </div>

        {reason && <p className="text-xs text-muted-foreground">{reason}</p>}

        {enabled && !blocked && (
          <>
            <div className="space-y-3 border-t pt-4">
              {PUSH_TYPES.map((type) => (
                <div key={type} className="flex items-center justify-between gap-4">
                  <Label htmlFor={`push-${type}`} className="font-normal text-sm">
                    {t(`settings.push.type.${type}`)}
                  </Label>
                  <Switch
                    id={`push-${type}`}
                    checked={selected.includes(type)}
                    onCheckedChange={(on) => toggleType(type, on)}
                    disabled={isPending}
                  />
                </div>
              ))}
              {selected.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("settings.push.noneSelected")}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 border-t pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={runTest}
                disabled={isPending}
              >
                {t("settings.push.sendTest")}
              </Button>
              {testResult && (
                <p className="text-xs text-muted-foreground">{testResult}</p>
              )}
            </div>
          </>
        )}

        {/* Surfaced from the DB: the reason the last real send failed. Without
            this a rejection is invisible outside the Vercel logs. */}
        {lastError && !testResult && (
          <p className="text-xs text-destructive">
            {t("settings.push.lastError", { error: lastError })}
          </p>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
