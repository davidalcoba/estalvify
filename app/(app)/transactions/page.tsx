// Transactions page — full transaction history from all connected bank accounts

import type { Metadata } from "next";
import { Suspense } from "react";
import { ArrowLeftRight } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TransactionFilters } from "@/components/transactions/transaction-filters";
import { TransactionsView } from "@/components/transactions/transactions-view";
import {
  groupTransactionsByDate,
  toTransactionListItemDTO,
} from "@/lib/transactions/transaction-dto";

export const metadata: Metadata = { title: "Transactions" };

const PAGE_SIZE = 50;

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string; page?: string; accountId?: string; q?: string }>;
}

// Skeleton for only the list portion — shown during pagination and filter changes.
// The filter panel stays rendered above so users can interact with it while data loads.
function TransactionsListSkeleton() {
  return (
    <div className="space-y-6">
      {/* Desktop list */}
      <div className="hidden md:block space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-52" />
          <Skeleton className="h-8 w-36" />
        </div>
        {[5, 4, 3].map((rows, i) => (
          <div key={i}>
            <Skeleton className="h-3 w-36 mb-2" />
            <div className="rounded-xl border overflow-hidden divide-y">
              {Array.from({ length: rows }).map((_, j) => (
                <div key={j} className="flex items-center gap-3 px-3 py-3">
                  <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-4 w-20 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Mobile list */}
      <div className="md:hidden space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-24" />
        </div>
        {[5, 4, 3].map((rows, i) => (
          <section key={i} className="space-y-2">
            <Skeleton className="h-3 w-28 mx-1" />
            <div className="space-y-2">
              {Array.from({ length: rows }).map((_, j) => (
                <div key={j} className="rounded-xl border overflow-hidden">
                  <div className="flex items-center gap-3 px-3 py-3">
                    <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-4 w-16 shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

interface TransactionsBodyProps {
  page: number;
  fromStr: string;
  toStr: string;
  fromDate: Date | null;
  toDate: Date | null;
  accountId: string;
  query: string;
  userId: string;
}

async function TransactionsBody({ page, fromStr, toStr, fromDate, toDate, accountId, query, userId }: TransactionsBodyProps) {
  const where = {
    userId,
    ...(fromDate || toDate
      ? { bookingDate: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } }
      : {}),
    ...(accountId ? { bankAccountId: accountId } : {}),
    ...(query
      ? {
          OR: [
            { description: { contains: query, mode: "insensitive" as const } },
            { remittanceInfo: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const total = await prisma.transaction.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const effectivePage = Math.min(Math.max(1, page), totalPages);

  const [transactions, prefs, categories] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        bankAccount: { select: { id: true, name: true } },
        categorization: { include: { category: { select: { name: true, color: true } } } },
      },
      orderBy: { bookingDate: "desc" },
      skip: (effectivePage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    getUserPrefs(userId),
    prisma.category.findMany({
      where: { userId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const rangeStart = total === 0 ? 0 : (effectivePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(effectivePage * PAGE_SIZE, total);

  const pageQuery = new URLSearchParams({
    ...(fromStr ? { from: fromStr } : {}),
    ...(toStr ? { to: toStr } : {}),
    ...(accountId ? { accountId } : {}),
    ...(query ? { q: query } : {}),
  }).toString();

  const txDtos = transactions.map(toTransactionListItemDTO);
  const groupedTransactions = groupTransactionsByDate(txDtos);

  if (txDtos.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
              <ArrowLeftRight className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <CardTitle>No transactions found</CardTitle>
          <CardDescription>
            {total === 0
              ? 'Connect a bank account and click "Sync Now" on the Accounts page to import your transactions.'
              : "No transactions in this date range. Try widening the filter."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <TransactionsView
      groupedTransactions={groupedTransactions}
      page={effectivePage}
      totalPages={totalPages}
      total={total}
      rangeStart={rangeStart}
      rangeEnd={rangeEnd}
      userLocale={prefs.locale}
      userTimezone={prefs.timezone}
      pageQuery={pageQuery}
      categories={categories}
    />
  );
}

export default async function TransactionsPage({ searchParams }: PageProps) {
  const session = await auth();
  const params = await searchParams;

  const fromDate = params.from ? new Date(params.from + "T00:00:00") : null;
  const toDate = params.to ? new Date(params.to + "T23:59:59") : null;
  const page = Math.max(1, parseInt(params.page ?? "1") || 1);
  const accountId = params.accountId ?? "";
  const query = (params.q ?? "").trim();

  const fromStr = params.from ?? "";
  const toStr = params.to ?? "";

  const userId = session!.user.id;

  // Fetch accounts at page level so TransactionFilters renders without skeleton
  const accounts = await prisma.bankAccount.findMany({
    where: { userId, isActive: true },
    select: { id: true, name: true, iban: true },
    orderBy: { name: "asc" },
  });

  // bodyKey resets the list Suspense → shows list skeleton while new data loads
  const bodyKey = `${page}-${fromStr}-${toStr}-${accountId}-${query}`;
  // filterKey remounts TransactionFilters when filters change → date inputs reset to new values
  const filterKey = `${fromStr}-${toStr}-${accountId}-${query}`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Transactions</h2>
        <p className="text-muted-foreground">
          Your complete transaction history across all bank accounts.
        </p>
      </div>

      {/* Filters stay visible during pagination and filter changes — only the list body skeletons */}
      <Suspense>
        <TransactionFilters
          key={filterKey}
          from={fromStr}
          to={toStr}
          accountId={accountId}
          query={query}
          accounts={accounts}
        />
      </Suspense>

      {/* Changing key resets the Suspense boundary → shows list skeleton while new data loads */}
      <Suspense key={bodyKey} fallback={<TransactionsListSkeleton />}>
        <TransactionsBody
          page={page}
          fromStr={fromStr}
          toStr={toStr}
          fromDate={fromDate}
          toDate={toDate}
          accountId={accountId}
          query={query}
          userId={userId}
        />
      </Suspense>
    </div>
  );
}
