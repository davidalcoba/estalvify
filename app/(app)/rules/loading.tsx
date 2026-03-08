// Skeleton shown by Next.js while the rules page server component loads

import { Skeleton } from "@/components/ui/skeleton";

function BuilderSkeleton() {
  return (
    <div className="rounded-xl border p-4 md:p-6 space-y-5">
      {/* Rule name */}
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-full" />
      </div>

      {/* Conditions */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-9" />
        </div>
        <Skeleton className="h-8 w-32" />
      </div>

      {/* Source + target */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-44" />
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-9 w-24" />
      </div>
    </div>
  );
}

function SavedRulesDesktopSkeleton() {
  return (
    <div className="rounded-xl border overflow-hidden hidden md:block">
      <div className="flex items-center gap-4 px-4 py-2.5 bg-muted/30 border-b">
        <Skeleton className="h-3 w-8" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-40 ml-4" />
        <Skeleton className="h-3 w-20 ml-auto" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 border-b last:border-0">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-4 w-32" />
          <div className="flex gap-1.5 ml-4">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-24" />
          </div>
          <Skeleton className="h-4 w-20 ml-auto" />
          <div className="flex gap-1">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SavedRulesMobileSkeleton() {
  return (
    <div className="space-y-3 md:hidden">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="h-5 w-5 rounded-full mt-0.5 shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <div className="flex gap-1.5">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="h-3 w-40" />
            </div>
            <div className="flex gap-1">
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function RulesLoading() {
  return (
    <div className="space-y-4">
      {/* Page title */}
      <div className="space-y-1">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* New rule section */}
      <div className="space-y-8">
        <div className="space-y-4">
          <div className="space-y-1">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-72" />
          </div>
          <BuilderSkeleton />
        </div>

        <div className="h-px bg-border" />

        {/* Saved rules section */}
        <div className="space-y-4">
          <div className="space-y-1">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-64" />
          </div>
          <SavedRulesDesktopSkeleton />
          <SavedRulesMobileSkeleton />
        </div>
      </div>
    </div>
  );
}
