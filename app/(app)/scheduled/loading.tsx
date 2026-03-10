// Skeleton loading screen for the Scheduled Transactions page.
// Next.js App Router automatically renders this while the async page.tsx resolves.

import { Skeleton } from "@/components/ui/skeleton";

export default function ScheduledLoading() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <Skeleton className="h-8 w-36 mb-2" />
        <Skeleton className="h-4 w-80" />
      </div>

      {/* New button */}
      <div className="flex justify-end">
        <Skeleton className="h-9 w-40" />
      </div>

      {/* Table skeleton — desktop */}
      <div className="hidden md:block rounded-lg border overflow-hidden">
        <div className="flex gap-4 px-4 py-2.5 border-b bg-muted/40">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-20 ml-auto" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b last:border-0">
            <div className="flex items-center gap-2 w-40">
              <Skeleton className="w-6 h-6 rounded-full shrink-0" />
              <Skeleton className="h-4 flex-1" />
            </div>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20 ml-auto" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>

      {/* Card skeleton — mobile */}
      <div className="md:hidden space-y-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
