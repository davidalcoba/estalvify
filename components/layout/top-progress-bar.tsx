"use client";

import { usePendingActivity } from "@/lib/pending-activity";
import { cn } from "@/lib/utils";

/**
 * Thin indeterminate bar pinned to the top of the viewport while anything is
 * in flight — a navigation, or a server action writing to the database.
 * Rendered once, in the app shell.
 *
 * It is the app's single "I heard you" signal: a write can change a row far
 * down the page, or nothing visible at all, and this still moves.
 *
 * The fade-in is delayed so work that resolves quickly never flashes a bar.
 * That delay lives in CSS (`delay-150`) rather than a timer, so the component
 * stays a pure function of the pending state.
 */
export function TopProgressBar() {
  const pending = usePendingActivity();

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
      {/* The bar is a visual-only cue; announce the activity too. */}
      <span role="status" aria-live="polite" className="sr-only">
        {pending ? "Loading" : ""}
      </span>
    </>
  );
}
