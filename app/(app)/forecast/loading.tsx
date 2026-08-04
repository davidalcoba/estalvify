// Skeleton shown by Next.js while the Forecast server component resolves.

import {
  PageHeaderSkeleton,
  KpiGridSkeleton,
  ChartCardSkeleton,
  TableCardSkeleton,
} from "@/components/layout/skeletons";

export default function ForecastLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton titleWidth="w-36" />

      <KpiGridSkeleton count={3} className="grid grid-cols-1 gap-4 md:grid-cols-3" />

      {/* Per-account cash-flow coverage cards */}
      <KpiGridSkeleton count={2} className="grid grid-cols-1 gap-4 md:grid-cols-2" />

      {/* Daily cash-flow curve */}
      <ChartCardSkeleton titleWidth="w-56" height={260} />

      <ChartCardSkeleton titleWidth="w-64" height={260} />

      <TableCardSkeleton rows={6} titleWidth="w-52" />
    </div>
  );
}
