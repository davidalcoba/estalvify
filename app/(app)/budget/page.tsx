// Budget page — YNAB-style envelope budgeting by month

import type { Metadata } from "next";
import { Suspense } from "react";
import { auth } from "@/auth";
import { getUserPrefs } from "@/lib/user-prefs";
import { getBudgetMonth } from "@/lib/budget/budget-calculator";
import { BudgetView } from "@/components/budget/budget-view";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Budget" };

interface PageProps {
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function BudgetPage({ searchParams }: PageProps) {
  // Only resolve session here — lightweight, reads from cookie
  const [params, session] = await Promise.all([searchParams, auth()]);
  const userId = session!.user.id;

  const now = new Date();
  const year = parseInt(params.year ?? "") || now.getFullYear();
  const month = parseInt(params.month ?? "") || now.getMonth() + 1;

  // Key drives Suspense reset when month changes
  const bodyKey = `budget-${year}-${month}`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Budget</h2>
        <p className="text-muted-foreground mt-1">
          Assign every euro a job. Track spending against your plan.
        </p>
      </div>

      {/* BudgetBody is inside Suspense so the skeleton shows immediately */}
      <Suspense key={bodyKey} fallback={<BudgetSkeleton />}>
        <BudgetBody userId={userId} year={year} month={month} />
      </Suspense>
    </div>
  );
}

async function BudgetBody({
  userId,
  year,
  month,
}: {
  userId: string;
  year: number;
  month: number;
}) {
  // getUserPrefs and budget data are fetched inside the Suspense boundary
  // so the skeleton above renders immediately on navigation
  const { locale, currency } = await getUserPrefs(userId);
  const data = await getBudgetMonth(userId, year, month, currency);

  return <BudgetView data={data} locale={locale} />;
}

function BudgetSkeleton() {
  return (
    <div className="space-y-4">
      {/* Month nav + Ready to Assign — desktop */}
      <div className="hidden md:flex items-center justify-between">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-9 w-48" />
      </div>

      {/* Month nav — mobile */}
      <div className="md:hidden flex items-center justify-between">
        <Skeleton className="h-9 w-9" />
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-9 w-9" />
      </div>

      {/* Ready to Assign card — mobile */}
      <div className="md:hidden">
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>

      {/* Table skeleton — desktop */}
      <div className="hidden md:block rounded-lg border overflow-hidden">
        <div className="flex gap-4 px-4 py-2.5 border-b bg-muted/40">
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-24" />
        </div>
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-3 border-b last:border-0">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>

      {/* Card skeleton — mobile */}
      <div className="md:hidden space-y-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
