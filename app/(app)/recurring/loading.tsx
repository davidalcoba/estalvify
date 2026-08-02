// Skeleton shown by Next.js while the Recurring server component resolves.

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeaderSkeleton } from "@/components/layout/skeletons";

function SummarySkeleton() {
  return (
    <Card>
      <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="min-w-0 space-y-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-6 w-24" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SectionSkeleton({ rows }: { rows: number }) {
  return (
    <section className="space-y-2">
      <Skeleton className="h-4 w-40" />
      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="divide-y p-0">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-4 w-20 shrink-0" />
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

export default function RecurringLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton titleWidth="w-36" />

      <SummarySkeleton />

      <div className="space-y-6">
        <SectionSkeleton rows={4} />
        <SectionSkeleton rows={3} />
      </div>
    </div>
  );
}
