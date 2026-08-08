// Skeleton shown by Next.js while the Dashboard server component resolves.
// v4: two cards — the week's number and the category list — side by side from
// `lg` up, stacked below. The body shape is shared with the page's own
// Suspense fallback so the two cannot drift.

import { PageHeaderSkeleton } from "@/components/layout/skeletons";
import { DashboardBodySkeleton } from "@/components/budget/dashboard-skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton titleWidth="w-64" />
      <DashboardBodySkeleton />
    </div>
  );
}
