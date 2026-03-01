// Transactions page — full transaction history from all connected bank accounts

import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPrefs, formatDate } from "@/lib/user-prefs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeftRight, ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { TransactionFilters } from "@/components/transactions/transaction-filters";

export const metadata: Metadata = { title: "Transactions" };

const PAGE_SIZE = 50;

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string; page?: string; accountId?: string }>;
}

export default async function TransactionsPage({ searchParams }: PageProps) {
  const session = await auth();
  const params = await searchParams;

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const defaultFrom = new Date(Date.now() - 30 * 86_400_000);
  defaultFrom.setHours(0, 0, 0, 0);

  const fromDate = params.from ? new Date(params.from + "T00:00:00") : defaultFrom;
  const toDate = params.to ? new Date(params.to + "T23:59:59") : today;
  const page = Math.max(1, parseInt(params.page ?? "1") || 1);
  const accountId = params.accountId ?? "";

  const fromStr = fromDate.toISOString().split("T")[0];
  const toStr = toDate.toISOString().split("T")[0];

  const where = {
    userId: session!.user.id,
    bookingDate: { gte: fromDate, lte: toDate },
    ...(accountId ? { bankAccountId: accountId } : {}),
  };

  const [total, transactions, accounts, prefs] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: { bankAccount: { select: { name: true } } },
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
  ]);

  const { locale: userLocale, timezone: userTimezone } = prefs;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Build a URL preserving current filters but changing page
  function pageUrl(p: number) {
    const sp = new URLSearchParams({ from: fromStr, to: toStr, page: String(p) });
    if (accountId) sp.set("accountId", accountId);
    return `/transactions?${sp.toString()}`;
  }

  // Group by booking date
  const grouped = new Map<string, typeof transactions>();
  for (const tx of transactions) {
    const key = tx.bookingDate.toISOString().split("T")[0];
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(tx);
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Transactions</h2>
        <p className="text-muted-foreground">
          Your complete transaction history across all bank accounts.
        </p>
      </div>

      {/* Filters */}
      <Suspense>
        <TransactionFilters from={fromStr} to={toStr} accountId={accountId} accounts={accounts} />
      </Suspense>

      {transactions.length === 0 ? (
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
                ? `Connect a bank account and click "Sync Now" on the Accounts page to import your transactions.`
                : "No transactions in this date range. Try widening the filter."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {/* Summary + pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {rangeStart}–{rangeEnd} of {total} transactions
            </p>
            <div className="flex items-center gap-1">
              {page > 1 ? (
                <Button variant="outline" size="sm" asChild className="h-8 w-8 p-0">
                  <Link href={pageUrl(page - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}
              <span className="text-sm px-2 tabular-nums">
                {page} / {totalPages}
              </span>
              {page < totalPages ? (
                <Button variant="outline" size="sm" asChild className="h-8 w-8 p-0">
                  <Link href={pageUrl(page + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Grouped list */}
          <div className="space-y-6">
            {Array.from(grouped.entries()).map(([dateKey, txs]) => (
              <div key={dateKey}>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  {formatDate(dateKey + "T12:00:00", userLocale, userTimezone, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
                <Card>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {txs.map((tx) => {
                        const isCredit = tx.direction === "CREDIT";
                        const label =
                          tx.description ??
                          (isCredit ? tx.debtorName : tx.creditorName) ??
                          "Transaction";
                        const counterparty = isCredit ? tx.debtorName : tx.creditorName;

                        return (
                          <div key={tx.id} className="flex items-center gap-4 px-4 py-3">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                                isCredit
                                  ? "bg-green-100 text-green-600"
                                  : "bg-red-100 text-red-500"
                              }`}
                            >
                              {isCredit ? (
                                <ArrowDownLeft className="h-4 w-4" />
                              ) : (
                                <ArrowUpRight className="h-4 w-4" />
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{label}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {counterparty && counterparty !== label
                                  ? `${counterparty} · `
                                  : ""}
                                {tx.bankAccount.name}
                              </p>
                            </div>

                            <p
                              className={`text-sm font-semibold tabular-nums shrink-0 ${
                                isCredit ? "text-green-600" : "text-foreground"
                              }`}
                            >
                              {isCredit ? "+" : "−"}
                              {Number(tx.amount).toLocaleString(userLocale, {
                                style: "currency",
                                currency: tx.currency,
                              })}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                  </CardContent>
                </Card>
              </div>
            ))}
          </div>

          {/* Bottom pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-muted-foreground">
                Showing {rangeStart}–{rangeEnd} of {total}
              </p>
              <div className="flex items-center gap-1">
                {page > 1 ? (
                  <Button variant="outline" size="sm" asChild className="h-8 w-8 p-0">
                    <Link href={pageUrl(page - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                )}
                <span className="text-sm px-2 tabular-nums">
                  {page} / {totalPages}
                </span>
                {page < totalPages ? (
                  <Button variant="outline" size="sm" asChild className="h-8 w-8 p-0">
                    <Link href={pageUrl(page + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
