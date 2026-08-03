// Skeleton shown by Next.js while the Reports server component resolves.

import { Skeleton } from "@/components/ui/skeleton";
import {
  PageHeaderSkeleton,
  ChartCardSkeleton,
  ListCardSkeleton,
} from "@/components/layout/skeletons";

export default function ReportsLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton titleWidth="w-32" />

      {/* Filter bar: month, trend window, account. */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
        <Skeleton className="h-9 w-full sm:w-[190px]" />
        <Skeleton className="h-9 w-full sm:w-[170px]" />
        <Skeleton className="h-9 w-full sm:w-[260px]" />
      </div>

      <ChartCardSkeleton titleWidth="w-72" height={300} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ListCardSkeleton rows={6} titleWidth="w-56" />
        <ListCardSkeleton rows={6} titleWidth="w-48" />
      </div>
    </div>
  );
}
