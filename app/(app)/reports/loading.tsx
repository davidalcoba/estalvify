// Skeleton shown by Next.js while the Reports server component resolves.

import {
  PageHeaderSkeleton,
  ChartCardSkeleton,
  ListCardSkeleton,
} from "@/components/layout/skeletons";

export default function ReportsLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton titleWidth="w-32" />

      <ChartCardSkeleton titleWidth="w-72" height={300} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ListCardSkeleton rows={6} titleWidth="w-56" />
        <ListCardSkeleton rows={6} titleWidth="w-48" />
      </div>
    </div>
  );
}
