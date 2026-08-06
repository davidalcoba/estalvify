// Skeleton shown by Next.js while the Settings server component resolves.

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeaderSkeleton } from "@/components/layout/skeletons";

function FieldSkeleton({ hint = true }: { hint?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-9 w-full" />
      {hint && <Skeleton className="h-3 w-44" />}
    </div>
  );
}

export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton titleWidth="w-28" />

      <div className="max-w-lg space-y-6">
        {/* Regional preferences */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-48" />
          </CardHeader>
          <CardContent className="space-y-5">
            <FieldSkeleton />
            <FieldSkeleton />
            <FieldSkeleton />
            <FieldSkeleton hint={false} />
            <Skeleton className="h-9 w-32" />
          </CardContent>
        </Card>

        {/* Alerts (low-balance threshold) */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-20" />
          </CardHeader>
          <CardContent className="space-y-5">
            <FieldSkeleton />
            <Skeleton className="h-9 w-32" />
          </CardContent>
        </Card>

        {/* Category manager */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-36" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-4 shrink-0 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-8 w-8 shrink-0" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Household members (owner-only; matches the card's list + form) */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-44" />
                  </div>
                  <Skeleton className="h-8 w-24" />
                </div>
              ))}
            </div>
            <div className="space-y-3 border-t pt-5">
              <Skeleton className="h-4 w-28" />
              <FieldSkeleton hint={false} />
              <FieldSkeleton />
              <Skeleton className="h-9 w-36" />
            </div>
          </CardContent>
        </Card>

        {/* Privacy & data (export + delete account) */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-9 w-40" />
            </div>
            <div className="space-y-1.5 border-t pt-5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-9 w-36" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
