// Skeleton shown by Next.js while the Recurring registry resolves.

import {
  PageHeaderSkeleton,
  ListCardSkeleton,
} from "@/components/layout/skeletons";

export default function RecurringLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton titleWidth="w-32" actionsWidth="w-24" />

      {/* Charges */}
      <ListCardSkeleton rows={8} titleWidth="w-28" />
      {/* Income */}
      <ListCardSkeleton rows={2} titleWidth="w-24" />
    </div>
  );
}
