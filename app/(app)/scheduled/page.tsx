// Scheduled transactions page — future recurring income and expenses

import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarClock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { toScheduledTransactionDTO } from "@/lib/scheduled/scheduled-dto";
import { ScheduledView } from "@/components/scheduled/scheduled-view";

export const metadata: Metadata = { title: "Scheduled Transactions" };

export default async function ScheduledPage() {
  // Only session here — lightweight, reads from cookie
  const session = await auth();
  const userId = session!.user.id;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-2xl font-bold tracking-tight">Scheduled</h2>
        </div>
        <p className="text-muted-foreground mt-1">
          Manage recurring income, expenses, and reminders.
        </p>
      </div>

      {/* Data inside Suspense so the skeleton shows immediately on navigation */}
      <Suspense fallback={<ScheduledSkeleton />}>
        <ScheduledBody userId={userId} />
      </Suspense>
    </div>
  );
}

async function ScheduledBody({ userId }: { userId: string }) {
  const [{ locale, currency, timezone }, rawTransactions, bankAccounts, categories] =
    await Promise.all([
      getUserPrefs(userId),
      prisma.scheduledTransaction.findMany({
        where: { userId },
        include: {
          category: { select: { name: true, color: true } },
          bankAccount: { select: { name: true } },
        },
        orderBy: [{ isActive: "desc" }, { nextDate: "asc" }],
      }),
      prisma.bankAccount.findMany({
        where: { userId, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.category.findMany({
        where: {
          OR: [{ userId }, { userId: null }],
          isActive: true,
        },
        select: { id: true, name: true, parentId: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
    ]);

  const transactions = rawTransactions.map(toScheduledTransactionDTO);

  return (
    <ScheduledView
      transactions={transactions}
      bankAccounts={bankAccounts}
      categories={categories}
      locale={locale}
      timezone={timezone}
      currency={currency}
    />
  );
}

function ScheduledSkeleton() {
  return (
    <div className="space-y-4">
      {/* New button placeholder */}
      <div className="flex justify-end">
        <Skeleton className="h-9 w-40" />
      </div>

      {/* Table skeleton — desktop */}
      <div className="hidden md:block rounded-lg border overflow-hidden">
        <div className="flex gap-4 px-4 py-2.5 border-b bg-muted/40">
          {[200, 120, 100, 80, 100, 80].map((w, i) => (
            <Skeleton key={i} className="h-3" style={{ width: w }} />
          ))}
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b last:border-0">
            <div className="flex items-center gap-2 flex-1">
              <Skeleton className="w-6 h-6 rounded-full" />
              <Skeleton className="h-4 w-36" />
            </div>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>

      {/* Card skeleton — mobile */}
      <div className="md:hidden space-y-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
