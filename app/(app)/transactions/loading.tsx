// Skeleton loading screen for the Transactions page.
// Next.js App Router automatically renders this while the async page.tsx resolves.

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

function TransactionRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <Skeleton className="w-8 h-8 rounded-full shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="h-4 w-20 shrink-0" />
    </div>
  );
}

function DateGroupSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div>
      <Skeleton className="h-3 w-36 mb-2" />
      <Card className="py-0 gap-0 overflow-hidden">
        <CardContent className="p-0 divide-y">
          {Array.from({ length: rows }).map((_, i) => (
            <TransactionRowSkeleton key={i} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function TransactionsLoading() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <Skeleton className="h-8 w-36 mb-2" />
        <Skeleton className="h-4 w-80" />
      </div>

      {/* Filters panel — date inputs + search (no presets) */}
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 flex-1 min-w-0" />
          <Skeleton className="h-9 flex-1 min-w-0" />
          <Skeleton className="h-9 w-16 shrink-0" />
        </div>
        <Skeleton className="h-9 w-full" />
      </div>

      {/* Desktop view */}
      <div className="hidden md:block space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-52" />
          <Skeleton className="h-8 w-36" />
        </div>
        <DateGroupSkeleton rows={5} />
        <DateGroupSkeleton rows={4} />
        <DateGroupSkeleton rows={3} />
      </div>

      {/* Mobile view */}
      <div className="md:hidden space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-24" />
        </div>
        {[5, 4, 3].map((rows, i) => (
          <section key={i} className="space-y-2">
            <Skeleton className="h-3 w-28 mx-1" />
            <div className="space-y-2">
              {Array.from({ length: rows }).map((_, j) => (
                <Card key={j} className="py-0 gap-0 overflow-hidden">
                  <CardContent className="p-0">
                    <TransactionRowSkeleton />
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
