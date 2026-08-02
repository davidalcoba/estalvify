"use client";

// Navigation feedback for the app shell.
//
// Every page under (app) is an async server component hitting the database, so
// a click has a visible gap before the new route paints. `loading.tsx` covers
// the main area, but the click itself needs to be acknowledged sooner than
// that — otherwise the app reads as frozen.
//
// Next's <Link> exposes useLinkStatus(), but only to descendants of that link.
// Pending links publish into the shared activity store, so the single
// TopProgressBar rendered in the shell reacts to any of them.

import { useEffect } from "react";
import { useLinkStatus } from "next/link";
import { Loader2, type LucideIcon } from "lucide-react";
import { beginActivity } from "@/lib/pending-activity";

/**
 * Reads this link's pending state and publishes it to the shared store.
 * Must be rendered inside a <Link>.
 */
export function useLinkPending() {
  const { pending } = useLinkStatus();

  useEffect(() => {
    if (!pending) return;
    return beginActivity();
  }, [pending]);

  return pending;
}

/**
 * Nav icon that turns into a spinner while its link is loading, so the item
 * you clicked is the thing that reacts. Must be rendered inside a <Link>.
 */
export function NavItemIcon({ icon: Icon }: { icon: LucideIcon }) {
  const pending = useLinkPending();

  return pending ? <Loader2 className="animate-spin" /> : <Icon />;
}
