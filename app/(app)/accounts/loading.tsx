// Skeleton loading screen for the Accounts page.
// Next.js App Router automatically renders this while the async page.tsx resolves.

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function BankAccountRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-50">
      <div className="flex-1 min-w-0 space-y-1">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-28" />
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
      <Skeleton className="h-7 w-7 rounded shrink-0" />
    </div>
  );
}

function BankCardSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-52" />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-3">
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-100 overflow-hidden">
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-36 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      {/* PSD2 security info card */}
      <Card className="bg-indigo-50 border-indigo-200">
        <CardContent className="flex items-start gap-3 pt-4 pb-4">
          <Skeleton className="h-5 w-5 shrink-0 mt-0.5 rounded" />
          <div className="space-y-1.5 flex-1">
            <Skeleton className="h-4 w-52" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </CardContent>
      </Card>

      {/* Bank cards */}
      <div className="space-y-4">
        <BankCardSkeleton rows={2} />
        <BankCardSkeleton rows={1} />
      </div>
    </div>
  );
}
