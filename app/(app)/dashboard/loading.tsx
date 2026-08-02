// Skeleton shown by Next.js while the Dashboard server component resolves.

import {
  PageHeaderSkeleton,
  KpiGridSkeleton,
  ChartCardSkeleton,
  ListCardSkeleton,
} from "@/components/layout/skeletons";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton titleWidth="w-64" />

      <KpiGridSkeleton count={4} />

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCardSkeleton className="lg:col-span-2" titleWidth="w-44" />
        <ListCardSkeleton rows={6} titleWidth="w-48" />
      </div>
    </div>
  );
}
