// Skeleton shown by Next.js while the Budget server component resolves.

import {
  PageHeaderSkeleton,
  ListCardSkeleton,
} from "@/components/layout/skeletons";

export default function PlanLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton titleWidth="w-40" actionsWidth="w-56" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Monthly cascade + reconciliation */}
        <ListCardSkeleton rows={9} titleWidth="w-40" />
        {/* Category objectives */}
        <ListCardSkeleton rows={6} titleWidth="w-44" />
      </div>
    </div>
  );
}
