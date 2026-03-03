// Skeleton loading screen for the Categorize page.
// Next.js App Router automatically renders this while the async page.tsx resolves.

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

function CategorizeRowSkeleton({ withCheckbox = false }: { withCheckbox?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      {withCheckbox && <Skeleton className="h-4 w-4 rounded shrink-0" />}
      <Skeleton className="w-8 h-8 rounded-full shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-3 w-28" />
      </div>
      <Skeleton className="h-4 w-20 shrink-0" />
      {withCheckbox && <Skeleton className="h-8 w-32 shrink-0" />}
    </div>
  );
}

const ROW_COUNT = 8;

export default function CategorizeLoading() {
  return (
    <>
      {/* Desktop view */}
      <div className="hidden md:block">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Skeleton className="h-8 w-36 mb-2" />
              <Skeleton className="h-4 w-72" />
            </div>
            <Skeleton className="h-6 w-20 mt-1 rounded-full" />
          </div>

          <Skeleton className="h-9 w-full" />

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-52" />
              <Skeleton className="h-8 w-24" />
            </div>
            <Skeleton className="h-8 w-36" />
          </div>

          <Card className="py-0 gap-0 overflow-hidden">
            <CardContent className="p-0 divide-y">
              <div className="flex items-center gap-3 px-3 py-2 bg-muted/20">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-3 w-20" />
              </div>
              {Array.from({ length: ROW_COUNT }).map((_, i) => (
                <CategorizeRowSkeleton key={i} withCheckbox />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Mobile view */}
      <div className="md:hidden">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Skeleton className="h-8 w-36 mb-2" />
              <Skeleton className="h-4 w-60" />
            </div>
            <Skeleton className="h-6 w-10 mt-1 rounded-full" />
          </div>

          <Skeleton className="h-10 w-full" />

          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-20" />
            <div className="flex items-center gap-1">
              <Skeleton className="h-7 w-7 rounded" />
              <Skeleton className="h-3 w-8" />
              <Skeleton className="h-7 w-7 rounded" />
            </div>
          </div>

          <div className="space-y-3">
            {Array.from({ length: ROW_COUNT }).map((_, i) => (
              <Card key={i} className="py-0 gap-0 overflow-hidden">
                <CardContent className="p-0">
                  <CategorizeRowSkeleton />
                  <div className="px-3 pb-3">
                    <Skeleton className="h-9 w-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
