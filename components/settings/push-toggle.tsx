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

/**
 * Is this subscription bound to the key we currently sign pushes with?
 *
 * A subscription remembers the `applicationServerKey` it was created with, and
 * the push service only accepts pushes signed by that pair. One created against
 * a different key — or against none, which is what an app deployed before the
 * VAPID variables were set handed to `subscribe()` — is permanently unreachable
 * while still looking healthy from the device: it keeps its endpoint, the
 * toggle reads as on, and every send is rejected server-side.
 */
function usesCurrentKey(subscription: PushSubscription, key: Uint8Array): boolean {
  const applied = subscription.options?.applicationServerKey;
  if (!applied) return false;
  const bytes = new Uint8Array(applied);
  return (
    bytes.length === key.length && bytes.every((byte, i) => byte === key[i])
  );
}

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
      // A subscription bound to a stale key reads as on while receiving
      // nothing, which is the worst of both: showing it as off is what puts
      // the repair — turning the switch back on — in front of the member.
      const usable =
        existing !== null &&
        VAPID_PUBLIC_KEY !== "" &&
        usesCurrentKey(existing, decodeVapidKey(VAPID_PUBLIC_KEY));
      if (!cancelled) setEnabled(usable);
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
    const key = decodeVapidKey(VAPID_PUBLIC_KEY);

    // Replace a subscription left over from another key rather than adding to
    // it: subscribe() answers an existing subscription with a *different*
    // applicationServerKey by throwing InvalidStateError, so without this the
    // device can never get back to a working one — turning the switch on just
    // fails, and turning it off and on again is the only escape.
    let existing = await registration.pushManager.getSubscription();
    if (existing && !usesCurrentKey(existing, key)) {
      const stale = existing.endpoint;
      await existing.unsubscribe();
      await deletePushSubscription(stale);
      existing = null;
    }

    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      }));

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
