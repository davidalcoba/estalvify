"use client";

// Previous/next month navigation for the monthly control. Plain links
// (?y=&m=) so the URL stays shareable; the clicked chevron turns into a
// spinner (and feeds the shared top progress bar) while the month's cards
// re-suspend — the click is acknowledged immediately.

import Link from "next/link";
import { ChevronLeft, ChevronRight, Loader2, type LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useLinkPending } from "@/components/layout/nav-progress";
import { cn } from "@/lib/utils";

function shift(year: number, month: number, by: number): { y: number; m: number } {
  const m0 = year * 12 + (month - 1) + by;
  return { y: Math.floor(m0 / 12), m: (m0 % 12) + 1 };
}

function PendingIcon({ icon: Icon }: { icon: LucideIcon }) {
  const pending = useLinkPending();
  return pending ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : (
    <Icon className="h-4 w-4" />
  );
}

export function MonthNav({
  year,
  month,
  isCurrent,
  locale,
}: {
  year: number;
  month: number;
  isCurrent: boolean;
  locale: string;
}) {
  const prev = shift(year, month, -1);
  const next = shift(year, month, 1);
  const label = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));

  return (
    <div className="flex items-center gap-1">
      <Link
        href={`/plan?y=${prev.y}&m=${prev.m}`}
        aria-label="Previous month"
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-8 w-8")}
      >
        <PendingIcon icon={ChevronLeft} />
      </Link>
      <span className="min-w-32 text-center text-sm font-medium capitalize">
        {label}
      </span>
      <Link
        href={`/plan?y=${next.y}&m=${next.m}`}
        aria-label="Next month"
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-8 w-8")}
      >
        <PendingIcon icon={ChevronRight} />
      </Link>
      {!isCurrent && (
        <Link
          href="/plan"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "ml-1 h-8")}
        >
          Today
        </Link>
      )}
    </div>
  );
}
