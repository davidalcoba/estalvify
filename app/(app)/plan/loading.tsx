// Skeleton shown by Next.js while the Plan server component resolves.

import { Skeleton } from "@/components/ui/skeleton";
import {
  PageHeaderSkeleton,
  KpiGridSkeleton,
  ListCardSkeleton,
} from "@/components/layout/skeletons";

export default function PlanLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton titleWidth="w-20" actionsWidth="w-52" />

      {/* Expected income / expenses / net */}
      <KpiGridSkeleton count={3} className="grid gap-4 sm:grid-cols-3" />

      {/* Expected income entries */}
      <ListCardSkeleton rows={3} titleWidth="w-36" />

      {/* Planned spending by category */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-16" />
        </div>
        <ListCardSkeleton rows={5} titleWidth="w-40" />
      </div>
    </div>
  );
}
