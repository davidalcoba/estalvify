"use client";

// Pull down at the top of a page to reload it, the way a native app does.
//
// The refresh is `router.refresh()` inside a transition: every screen in the
// app is a server component, so re-running the route on the server is exactly
// what "reload" means here — the data comes back fresh, client state (open
// month, filters, scroll) survives, and `isPending` tells us when it landed,
// which is what the spinner waits for.
//
// Only on touch devices. The gesture is claimed from the browser on those, so
// while it is mounted the native pull-to-refresh (Chrome) and the rubber-band
// bounce (iOS) are turned off — two refresh affordances fighting over the same
// finger movement is worse than either alone.

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  PULL_HOLD,
  PULL_SLOP,
  PULL_THRESHOLD,
  pullDistance,
} from "@/lib/ui/pull-to-refresh";

/** Shortest time the spinner stays up, so a fast refresh is not a flicker. */
const MIN_SPIN_MS = 450;

/** Nothing spins forever: an unanswered refresh settles anyway. */
const MAX_SPIN_MS = 10_000;

export type PullPhase = "idle" | "pulling" | "armed" | "refreshing";

export interface PullToRefreshState {
  /** Attach to the element the gesture is read from (also the one that moves). */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Current travel in px. */
  distance: number;
  phase: PullPhase;
  /** True while the sheet is animating back on its own — the view eases, the finger does not. */
  settling: boolean;
}

export function usePullToRefresh(): PullToRefreshState {
  const router = useRouter();
  const containerRef = useRef<HTMLElement | null>(null);

  const [distance, setDistance] = useState(0);
  const [phase, setPhase] = useState<PullPhase>("idle");
  const [settling, setSettling] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Read inside listeners that are attached once; state would be stale there.
  const phaseRef = useRef<PullPhase>("idle");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  const startedAt = useRef(0);

  const settle = useCallback(() => {
    setSettling(true);
    setDistance(0);
    setPhase("idle");
  }, []);

  const refresh = useCallback(() => {
    startedAt.current = Date.now();
    setSettling(true);
    setPhase("refreshing");
    setDistance(PULL_HOLD);
    startTransition(() => router.refresh());
  }, [router]);

  // ── The gesture ──────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // A mouse cannot rubber-band a page, and a desktop browser has a reload
    // button two centimetres away.
    if (!window.matchMedia("(pointer: coarse)").matches) return;

    let startY = 0;
    let startX = 0;
    let tracking = false; // touch began somewhere a pull could start
    let pulling = false; // and has since committed to a downward drag
    // Kept here rather than read back off `phase`: touchend can follow the last
    // touchmove inside the same task, before React has committed that state.
    let armed = false;

    const atTop = () =>
      (document.scrollingElement?.scrollTop ?? window.scrollY) <= 0;

    /** A pull that starts inside an already-scrolled region belongs to that region. */
    const insideScrolledRegion = (target: EventTarget | null) => {
      let node = target instanceof Element ? target : null;
      while (node && node !== el) {
        if (node.scrollTop > 0) return true;
        node = node.parentElement;
      }
      return false;
    };

    const reset = () => {
      tracking = false;
      pulling = false;
      armed = false;
    };

    function onTouchStart(e: TouchEvent) {
      reset();
      if (e.touches.length !== 1) return;
      if (phaseRef.current === "refreshing") return;
      if (!atTop()) return;
      // A dialog or the mobile sidebar is open: the page behind it is frozen
      // and must not be refreshed out from under the sheet.
      if (document.body.hasAttribute("data-scroll-locked")) return;
      if (insideScrolledRegion(e.target)) return;

      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      tracking = true;
    }

    function onTouchMove(e: TouchEvent) {
      if (!tracking || e.touches.length !== 1) return;

      const dy = e.touches[0].clientY - startY;
      const dx = e.touches[0].clientX - startX;

      if (!pulling) {
        // Decide once, on the first few pixels, whether this is our gesture:
        // an upward or sideways start stays the page's (scroll, carousel, swipe).
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) return reset();
        if (dy < PULL_SLOP) return;
        pulling = true;
        setSettling(false);
      }

      // The page scrolled away under the finger (momentum still running).
      if (!atTop()) {
        reset();
        settle();
        return;
      }

      // Claims the movement: without this iOS bounces the whole document and
      // Chrome runs its own refresh on top of ours. Requires a non-passive
      // listener, which is why these are attached by hand.
      if (e.cancelable) e.preventDefault();

      const next = pullDistance(dy - PULL_SLOP);
      armed = next >= PULL_THRESHOLD;
      setDistance(next);
      setPhase(armed ? "armed" : "pulling");
    }

    function onTouchEnd() {
      const wasPulling = pulling;
      const wasArmed = armed;
      reset();
      if (!wasPulling) return;
      if (wasArmed) refresh();
      else settle();
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [refresh, settle]);

  // ── Give up the browser's own overscroll while we own the gesture ────────
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const { body } = document;
    const previous = body.style.overscrollBehaviorY;
    body.style.overscrollBehaviorY = "contain";
    return () => {
      body.style.overscrollBehaviorY = previous;
    };
  }, []);

  // ── Landing ──────────────────────────────────────────────────────────────
  // `isPending` falls when the server's payload has been applied, which is the
  // real end of the refresh; the dwell only keeps a 60ms round trip from
  // reading as a glitch.
  useEffect(() => {
    if (phase !== "refreshing" || isPending) return;
    const wait = Math.max(0, MIN_SPIN_MS - (Date.now() - startedAt.current));
    const timer = setTimeout(settle, wait);
    return () => clearTimeout(timer);
  }, [phase, isPending, settle]);

  useEffect(() => {
    if (phase !== "refreshing") return;
    const timer = setTimeout(settle, MAX_SPIN_MS);
    return () => clearTimeout(timer);
  }, [phase, settle]);

  return { containerRef, distance, phase, settling };
}
