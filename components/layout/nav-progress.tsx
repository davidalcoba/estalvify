"use client";

// Navigation feedback for the app shell.
//
// Every page under (app) is an async server component hitting the database, so
// a click has a visible gap before the new route paints. `loading.tsx` covers
// the main area, but the click itself needs to be acknowledged sooner than
// that — otherwise the app reads as frozen.
//
// Next's <Link> exposes useLinkStatus(), but only to descendants of that link.
// Pending links publish into this module-level store so a single progress bar,
// rendered once in the shell, can react to any of them.

import { useEffect, useSyncExternalStore } from "react";
import { useLinkStatus } from "next/link";
import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

let pendingCount = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit() {
  for (const listener of listeners) listener();
}

const getSnapshot = () => pendingCount > 0;
const getServerSnapshot = () => false;

/**
 * True while any instrumented link is navigating. Subscribe with
 * useSyncExternalStore so a nav starting outside React's render cycle still
 * flushes to every consumer.
 */
function useNavPending() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Reads this link's pending state and publishes it to the shared store.
 * Must be rendered inside a <Link>.
 */
export function useLinkPending() {
  const { pending } = useLinkStatus();

  useEffect(() => {
    if (!pending) return;

    pendingCount += 1;
    emit();

    return () => {
      pendingCount -= 1;
      emit();
    };
  }, [pending]);

  return pending;
}

/**
 * Thin indeterminate bar pinned to the top of the viewport while a navigation
 * is in flight. Rendered once, in the app shell.
 *
 * The fade-in is delayed so navigations that resolve quickly never flash a bar.
 * That delay lives in CSS (`delay-150`) rather than a timer, so the component
 * stays a pure function of the pending state.
 */
export function NavProgressBar() {
  const pending = useNavPending();

  return (
    <>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden transition-opacity duration-200",
          pending ? "opacity-100 delay-150" : "opacity-0 delay-0",
        )}
      >
        {pending && <div className="animate-nav-progress h-full w-full bg-brand" />}
      </div>
      {/* The bar is a visual-only cue; announce the transition too. */}
      <span role="status" aria-live="polite" className="sr-only">
        {pending ? "Loading page" : ""}
      </span>
    </>
  );
}

/**
 * Nav icon that turns into a spinner while its link is loading, so the item
 * you clicked is the thing that reacts. Must be rendered inside a <Link>.
 */
export function NavItemIcon({ icon: Icon }: { icon: LucideIcon }) {
  const pending = useLinkPending();

  return pending ? <Loader2 className="animate-spin" /> : <Icon />;
}
