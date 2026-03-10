// Skeleton loading screen for the Budget page.
// Next.js App Router automatically renders this while the async page.tsx resolves.

import { Skeleton } from "@/components/ui/skeleton";

export default function BudgetLoading() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <Skeleton className="h-8 w-24 mb-2" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Month nav + Ready to Assign — desktop */}
      <div className="hidden md:flex items-center justify-between">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-9 w-48" />
      </div>

      {/* Month nav — mobile */}
      <div className="md:hidden flex items-center justify-between">
        <Skeleton className="h-9 w-9" />
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-9 w-9" />
      </div>

      {/* Ready to Assign card — mobile */}
      <div className="md:hidden">
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>

      {/* Table skeleton — desktop */}
      <div className="hidden md:block rounded-lg border overflow-hidden">
        <div className="flex gap-4 px-4 py-2.5 border-b bg-muted/40">
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-24" />
        </div>
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-3 border-b last:border-0">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>

      {/* Card skeleton — mobile */}
      <div className="md:hidden space-y-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
