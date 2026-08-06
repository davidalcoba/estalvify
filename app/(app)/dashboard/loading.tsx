// Skeleton shown by Next.js while the Dashboard server component resolves.
// v4: the daily screen is a single centered card (two numbers + composition).

import { ListCardSkeleton, PageHeaderSkeleton } from "@/components/layout/skeletons";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton titleWidth="w-64" />
      <div className="mx-auto w-full max-w-xl">
        <ListCardSkeleton rows={4} titleWidth="w-40" />
      </div>
    </div>
  );
}
