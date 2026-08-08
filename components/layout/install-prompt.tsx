"use client";

// Nudges the user to install the PWA, with a different route per platform.
//
// Android/Chrome fires `beforeinstallprompt`, which we stash and replay from a
// button — the browser only accepts prompt() during a user gesture. iOS has no
// such event: Add to Home Screen is manual, so all we can do is show where it
// lives. That path matters more than it looks, because iOS only delivers web
// push to *installed* apps — see components/settings/push-toggle.tsx.

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const DISMISSED_KEY = "estalvify:install-prompt-dismissed";

/** The slice of BeforeInstallPromptEvent we use; it is not in lib.dom yet. */
type InstallPromptEvent = Event & { prompt: () => Promise<void> };

/**
 * Whether we are past hydration. Everything this component decides depends on
 * `window`, so it can only be read on the client. useSyncExternalStore is the
 * supported way to surface that: setting a flag from an effect would be a
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

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const isClient = useIsClient();

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      // Suppress Chrome's own mini-infobar so ours is the only affordance.
      event.preventDefault();
      setDeferred(event as InstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
    setDeferred(null);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    // The event is single-use whether or not the user accepted.
    dismiss();
  }

  if (!isClient || dismissed) return null;
  if (isStandalone() || localStorage.getItem(DISMISSED_KEY)) return null;

  // On iOS there is no installability event to wait for — the manual
  // instructions are the only thing we can offer.
  const iosHint = isIos();
  if (!deferred && !iosHint) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md pb-safe-4">
      <Card className="shadow-lg">
        <CardContent className="flex items-center gap-3 py-3">
          <div className="flex-1 text-sm">
            {iosHint ? (
              <span className="flex flex-wrap items-center gap-1">
                Install Estalvify: tap
                <Share className="inline size-4" aria-label="Share" />
                then &ldquo;Add to Home Screen&rdquo;.
              </span>
            ) : (
              "Install Estalvify for a full-screen app."
            )}
          </div>
          {!iosHint && (
            <Button size="sm" onClick={install}>
              <Download />
              Install
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={dismiss}
            aria-label="Dismiss"
          >
            <X />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
