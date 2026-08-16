"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/components/layout/page-title-context";

// Shared page header: title + optional right-aligned actions slot. Screens are
// terse (SaaS-style) — no subtitle. Unifies heading size and spacing so every page
// opens the same way instead of re-deriving the header block.
//
// It also owns the handover to the sticky header: while this heading is on
// screen it is the page's only title, and the header's copy stays hidden. See
// `page-title-context.tsx`.

/** Fallback for the sticky header's height, if it is not on the page. */
const HEADER_FALLBACK_PX = 56;

export function PageHeader({
  title,
  actions,
  className,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pageTitle = usePageTitle();
  const reportVisible = pageTitle?.reportVisible;

  useEffect(() => {
    const el = headingRef.current;
    if (!el || !reportVisible) return;

    // The sticky header paints on top of the page, so a heading that is
    // technically still in the viewport but behind it is gone as far as the
    // reader is concerned. Measured rather than hardcoded: the header grows by
    // the status-bar inset once the app is installed (`h-header-safe`).
    const header = document.querySelector("[data-app-header]");
    const offset = header?.getBoundingClientRect().height ?? HEADER_FALLBACK_PX;

    const observer = new IntersectionObserver(
      ([entry]) => reportVisible(entry.isIntersecting),
      { rootMargin: `-${Math.round(offset)}px 0px 0px 0px` },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      // Unmounting is a navigation or a route falling back to its skeleton:
      // hand the title back to the page that comes next, which starts at the
      // top with its own heading on screen.
      reportVisible(true);
    };
  }, [reportVisible]);

  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 ref={headingRef} className="text-2xl font-bold tracking-tight">
          {title}
        </h2>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
