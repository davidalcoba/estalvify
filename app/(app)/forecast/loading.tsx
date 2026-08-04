// Skeleton shown by Next.js while the Upcoming server component resolves.

import {
  PageHeaderSkeleton,
  KpiGridSkeleton,
  ChartCardSkeleton,
  TableCardSkeleton,
} from "@/components/layout/skeletons";

export default function ForecastLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton titleWidth="w-32" />

      {/* Per-account coverage cards */}
      <KpiGridSkeleton count={2} className="grid grid-cols-1 gap-4 md:grid-cols-2" />

      {/* Planned items list */}
      <TableCardSkeleton rows={8} titleWidth="w-44" />

      {/* Daily projected balance */}
      <ChartCardSkeleton titleWidth="w-64" height={260} />
    </div>
  );
}
