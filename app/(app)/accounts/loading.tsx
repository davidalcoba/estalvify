// Skeleton loading screen for the Accounts page.
// Next.js App Router automatically renders this while the async page.tsx resolves.

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeaderSkeleton } from "@/components/layout/skeletons";

function BankAccountRowSkeleton() {
  return (
    <div className="flex items-center gap-3 bg-muted/50 px-3 py-2.5">
      <div className="min-w-0 flex-1 space-y-1">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="h-4 w-20 shrink-0" />
      <Skeleton className="h-7 w-7 shrink-0 rounded" />
    </div>
  );
}

function BankCardSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        {/* Mirrors the real header, which wraps on narrow screens. */}
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-3">
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {Array.from({ length: rows }).map((_, i) => (
            <BankAccountRowSkeleton key={i} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AccountsLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton titleWidth="w-40" actionsWidth="w-32" />

      {/* PSD2 one-liner */}
      <Card className="bg-brand/5 border-brand/20">
        <CardContent className="flex items-center gap-3 pt-4 pb-4">
          <Skeleton className="h-5 w-5 shrink-0 rounded" />
          <Skeleton className="h-4 w-full max-w-md" />
        </CardContent>
      </Card>

      {/* Bank cards */}
      <div className="space-y-4">
        <BankCardSkeleton rows={2} />
      </div>
    </div>
  );
}
