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
  const params = await searchParams;
  const session = await auth();
  const userId = session!.user.id;
  const { locale, currency } = await getUserPrefs(userId);

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

      <Suspense key={bodyKey} fallback={<BudgetSkeleton />}>
        <BudgetBody
          userId={userId}
          year={year}
          month={month}
          locale={locale}
          currency={currency}
        />
      </Suspense>
    </div>
  );
}

async function BudgetBody({
  userId,
  year,
  month,
  locale,
  currency,
}: {
  userId: string;
  year: number;
  month: number;
  locale: string;
  currency: string;
}) {
  const data = await getBudgetMonth(userId, year, month, currency);

  return <BudgetView data={data} locale={locale} />;
}

function BudgetSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-9 w-48" />
      </div>
      <div className="rounded-lg border">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-3 border-b last:border-0">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
