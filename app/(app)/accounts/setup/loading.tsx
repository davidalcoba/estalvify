// Skeleton shown by Next.js while the account-selection server component
// resolves. This route lands straight off the bank's OAuth redirect, so the
// wait is the first thing the user sees after leaving their bank.

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeaderSkeleton } from "@/components/layout/skeletons";

export default function AccountsSetupLoading() {
  return (
    <div className="max-w-lg space-y-6">
      <PageHeaderSkeleton titleWidth="w-72" />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 shrink-0 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-4 shrink-0 rounded" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
          ))}
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
