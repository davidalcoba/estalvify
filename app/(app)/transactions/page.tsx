// Transactions page — full transaction history from all connected bank accounts

import type { Metadata } from "next";
import { Suspense } from "react";
import { ArrowLeftRight } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
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

export default async function TransactionsPage({ searchParams }: PageProps) {
  const session = await auth();
  const params = await searchParams;

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const defaultFrom = new Date(today);
  defaultFrom.setDate(defaultFrom.getDate() - 30);
  defaultFrom.setHours(0, 0, 0, 0);

  const fromDate = params.from ? new Date(params.from + "T00:00:00") : defaultFrom;
  const toDate = params.to ? new Date(params.to + "T23:59:59") : today;
  const page = Math.max(1, parseInt(params.page ?? "1") || 1);
  const accountId = params.accountId ?? "";
  const query = (params.q ?? "").trim();

  const fromStr = fromDate.toISOString().split("T")[0];
  const toStr = toDate.toISOString().split("T")[0];

  const where = {
    userId: session!.user.id,
    bookingDate: { gte: fromDate, lte: toDate },
    ...(accountId ? { bankAccountId: accountId } : {}),
    ...(query
      ? {
          OR: [
            { description: { contains: query, mode: "insensitive" as const } },
            { creditorName: { contains: query, mode: "insensitive" as const } },
            { debtorName: { contains: query, mode: "insensitive" as const } },
            { remittanceInfo: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, transactions, accounts, prefs, categories] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: {
        bankAccount: { select: { id: true, name: true } },
        categorization: { include: { category: { select: { name: true, color: true } } } },
      },
      orderBy: { bookingDate: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.bankAccount.findMany({
      where: { userId: session!.user.id, isActive: true },
      select: { id: true, name: true, iban: true },
      orderBy: { name: "asc" },
    }),
    getUserPrefs(session!.user.id),
    prisma.category.findMany({
      where: { userId: session!.user.id, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  const pageQuery = new URLSearchParams({
    from: fromStr,
    to: toStr,
    ...(accountId ? { accountId } : {}),
    ...(query ? { q: query } : {}),
  }).toString();

  const txDtos = transactions.map(toTransactionListItemDTO);
  const groupedTransactions = groupTransactionsByDate(txDtos);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Transactions</h2>
        <p className="text-muted-foreground">
          Your complete transaction history across all bank accounts.
        </p>
      </div>

      <Suspense>
        <TransactionFilters
          from={fromStr}
          to={toStr}
          accountId={accountId}
          query={query}
          accounts={accounts}
        />
      </Suspense>

      {txDtos.length === 0 ? (
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
      ) : (
        <TransactionsView
          groupedTransactions={groupedTransactions}
          page={page}
          totalPages={totalPages}
          total={total}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          userLocale={prefs.locale}
          userTimezone={prefs.timezone}
          pageQuery={pageQuery}
          categories={categories}
        />
      )}
    </div>
  );
}
