// Shared skeleton building blocks for route-level `loading.tsx` files.
//
// Every page opens with the same shapes (PageHeader, KPI row, chart card,
// list card), so the skeletons are defined once here instead of being
// re-derived per route — that keeps the placeholder aligned with the real
// layout and avoids a jump when the server component resolves.

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Matches <PageHeader />: a single 2xl bold title, optional actions slot. */
export function PageHeaderSkeleton({
  titleWidth = "w-40",
  actionsWidth,
}: {
  titleWidth?: string;
  /** Set to render a right-aligned action block of this width. */
  actionsWidth?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <Skeleton className={cn("h-8", titleWidth)} />
      {actionsWidth && <Skeleton className={cn("h-9 shrink-0", actionsWidth)} />}
    </div>
  );
}

/** Matches the `Kpi` cards used on Dashboard / Forecast / Plan. */
export function KpiCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-4 rounded-sm" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-3 w-24" />
      </CardContent>
    </Card>
  );
}

export function KpiGridSkeleton({
  count = 4,
  className = "grid gap-4 md:grid-cols-2 lg:grid-cols-4",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <KpiCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Card with a title and a chart-sized body. Bars are drawn at varying heights
 * so the placeholder reads as a chart rather than a grey block.
 */
export function ChartCardSkeleton({
  height = 240,
  titleWidth = "w-48",
  className,
}: {
  height?: number;
  titleWidth?: string;
  className?: string;
}) {
  const bars = [55, 80, 40, 95, 65, 75, 45, 88, 60, 70, 50, 85];

  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className={cn("h-5", titleWidth)} />
      </CardHeader>
      <CardContent>
        <div
          className="flex items-end justify-between gap-1.5 sm:gap-2"
          style={{ height }}
        >
          {bars.map((h, i) => (
            <Skeleton key={i} className="flex-1" style={{ height: `${h}%` }} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Card wrapping a list of label/value rows (top categories, merchants…). */
export function ListCardSkeleton({
  rows = 5,
  titleWidth = "w-40",
  className,
}: {
  rows?: number;
  titleWidth?: string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className={cn("h-5", titleWidth)} />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20 shrink-0" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Bordered table-ish block: a header strip plus evenly spaced rows. */
export function TableCardSkeleton({
  rows = 6,
  titleWidth = "w-44",
  className,
}: {
  rows?: number;
  titleWidth?: string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className={cn("h-5", titleWidth)} />
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y border-t">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="ml-auto h-4 w-20" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
