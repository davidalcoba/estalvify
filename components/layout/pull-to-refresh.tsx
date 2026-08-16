"use client";

// The app shell's <main>, made pullable.
//
// It renders the main element itself rather than wrapping it, because the
// gesture moves the whole sheet: the page slides down under the sticky header
// and the indicator comes out from behind it, which is what makes the movement
// read as the page being pulled rather than as a widget appearing. The header
// stays put and stays opaque, so it clips the indicator at rest.
//
// The mechanics — when the gesture arms, what "refresh" means, why it is touch
// only — are in `hooks/use-pull-to-refresh.ts`.

import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/i18n-provider";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { pullProgress } from "@/lib/ui/pull-to-refresh";

/** How far above the page's top edge the indicator hides. */
const INDICATOR_OFFSET = 44;

export function PullToRefresh({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const t = useT();
  const { containerRef, distance, phase, settling } = usePullToRefresh();

  const active = phase !== "idle" || distance > 0;
  const progress = pullProgress(distance);
  const refreshing = phase === "refreshing";
  // Only while the sheet is off its rest position. A permanent transform would
  // make <main> a containing block for every fixed-position descendant.
  const moved = active
    ? {
        transform: `translate3d(0, ${distance}px, 0)`,
        // The finger owns the movement; only the return trip is animated.
        transition: settling ? "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)" : "none",
      }
    : undefined;

  return (
    <main ref={containerRef} className={cn("relative", className)} style={moved}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center"
        style={{
          transform: `translate3d(0, -${INDICATOR_OFFSET}px, 0)`,
          opacity: refreshing ? 1 : progress,
        }}
      >
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-full border bg-card shadow-sm",
            "transition-colors",
            phase === "armed" && "border-brand/40 text-brand",
          )}
          style={
            // Grows into place as it is pulled, so a half-hearted pull looks
            // half-committed rather than ready to fire.
            refreshing ? undefined : { transform: `scale(${0.7 + progress * 0.3})` }
          }
        >
          {refreshing ? (
            <Loader2 className="size-4 animate-spin text-brand" />
          ) : (
            <RefreshCw
              className={cn("size-4", phase === "armed" ? "text-brand" : "text-muted-foreground")}
              // Turns with the pull and lands upright the moment it arms.
              style={{ transform: `rotate(${progress * 180}deg)` }}
            />
          )}
        </span>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {refreshing ? t("common.refreshing") : ""}
      </span>

      {children}
    </main>
  );
}
