// Skeleton shown by Next.js while the Monthly control server component resolves.

import {
  PageHeaderSkeleton,
  ListCardSkeleton,
} from "@/components/layout/skeletons";

export default function PlanLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton titleWidth="w-40" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Monthly cascade */}
        <ListCardSkeleton rows={5} titleWidth="w-40" />
        {/* Rollover funds */}
        <ListCardSkeleton rows={3} titleWidth="w-36" />
      </div>
    </div>
  );
}
