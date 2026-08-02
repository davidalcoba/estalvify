// Skeleton shown by Next.js while the Notifications server component resolves.

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeaderSkeleton } from "@/components/layout/skeletons";

export default function NotificationsLoading() {
  return (
    <div className="space-y-4">
      <PageHeaderSkeleton titleWidth="w-44" />

      {/* All / Unread filters + actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-24" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-8 w-28" />
        </div>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="divide-y p-0">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 p-4">
              <Skeleton className="mt-0.5 size-4 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-3 w-full max-w-md" />
              </div>
              <Skeleton className="h-3 w-16 shrink-0" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
