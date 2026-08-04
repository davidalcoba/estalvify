// Skeleton shown by Next.js while the Envelopes server component resolves.

import {
  PageHeaderSkeleton,
  KpiGridSkeleton,
  ListCardSkeleton,
} from "@/components/layout/skeletons";

export default function EnvelopesLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton titleWidth="w-32" />

      {/* Months of cushion */}
      <KpiGridSkeleton count={1} className="grid grid-cols-1 gap-4" />

      {/* Envelope list */}
      <ListCardSkeleton rows={4} titleWidth="w-44" />
    </div>
  );
}
