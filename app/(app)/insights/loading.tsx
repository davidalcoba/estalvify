// Skeleton shown by Next.js while the Insights route segment loads.
//
// The page itself awaits nothing (recommendations are generated on demand from
// the client), but the segment is still fetched over the network, so without
// this the nav click has no feedback at all.

import { Skeleton } from "@/components/ui/skeleton";
import { PageHeaderSkeleton } from "@/components/layout/skeletons";

export default function InsightsLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton titleWidth="w-28" />

      <div className="space-y-6">
        {/* Privacy blurb + generate button */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="max-w-prose flex-1 space-y-1.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <Skeleton className="h-9 w-44 shrink-0" />
        </div>

        {/* Empty state card that greets a first visit */}
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    </div>
  );
}
