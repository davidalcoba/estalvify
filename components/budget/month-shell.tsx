"use client";

// Client shell of the Budget screen: month navigation + the body slot.
// Navigation runs through useTransition so the click swaps the cards to the
// skeleton IMMEDIATELY — no waiting for the server round-trip — and the URL
// (?y=&m=) stays shareable. The Today slot is always rendered (invisible on
// the current month) so the arrows and the label never shift position.

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { ListCardSkeleton } from "@/components/layout/skeletons";

function shift(
  year: number,
  month: number,
  by: number,
): { y: number; m: number } {
  const m0 = year * 12 + (month - 1) + by;
  return { y: Math.floor(m0 / 12), m: (m0 % 12) + 1 };
}

export function BudgetBodySkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        {/* "Your plan" then "How the month is going" — mirrors loading.tsx */}
        <ListCardSkeleton rows={5} titleWidth="w-24" />
        <ListCardSkeleton rows={3} titleWidth="w-44" />
      </div>
      <ListCardSkeleton rows={6} titleWidth="w-44" />
    </div>
  );
}

export function MonthShell({
  year,
  month,
  isCurrent,
  locale,
  children,
}: {
  year: number;
  month: number;
  isCurrent: boolean;
  locale: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const prev = shift(year, month, -1);
  const next = shift(year, month, 1);
  const label = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));

  function go(href: string) {
    startTransition(() => router.push(href));
  }

  return (
    <div className="space-y-6">
      {/* Sticky under the app bar (h-14) instead of scrolling under it: the
          month selector is a control you reach for WHILE reading the objectives
          list, and the title used to be clipped by the bar on the way past.
          Negative margins so the background spans the main padding (p-4 /
          lg:p-6) and rows do not show through the edges. */}
      <div className="sticky top-14 z-30 -mx-4 bg-background px-4 py-2 lg:-mx-6 lg:px-6">
        <PageHeader
          title="Budget"
          actions={
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className={`mr-1 h-8 ${isCurrent ? "invisible" : ""}`}
                aria-hidden={isCurrent}
                tabIndex={isCurrent ? -1 : undefined}
                onClick={() => go("/plan")}
                disabled={isPending}
              >
                Today
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Previous month"
                onClick={() => go(`/plan?y=${prev.y}&m=${prev.m}`)}
                disabled={isPending}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-32 text-center text-sm font-medium capitalize">
                {label}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Next month"
                onClick={() => go(`/plan?y=${next.y}&m=${next.m}`)}
                disabled={isPending}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          }
        />
      </div>
      {isPending ? <BudgetBodySkeleton /> : children}
    </div>
  );
}
