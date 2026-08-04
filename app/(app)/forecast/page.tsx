// Upcoming charges — the plannedItems list (series instances and one-offs in
// one list, ordered by date) plus the projected per-account balance, so the
// rent-before-salary squeeze is visible with days to act on it.

import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { syncPlannedState } from "@/lib/planned/engine";
import { buildCashflowData } from "@/lib/analytics/cashflow-data";
import { resolveWindow, isoDate } from "@/lib/planned/schedule";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { BalanceForecastChart } from "@/components/reports/balance-forecast-chart";
import { PlannedList, type PlannedRowVM } from "@/components/planned/planned-list";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = { title: "Upcoming" };

const CASHFLOW_HORIZON_DAYS = 60;
const LIST_MONTHS_AHEAD = 2;

export default async function ForecastPage() {
  const session = await auth();
  const userId = session!.user.id;
  const { locale, language, timezone, currency } = await getUserPrefs(userId);

  await syncPlannedState(userId, timezone, currency, locale);
  const cashflow = await buildCashflowData(userId, timezone, CASHFLOW_HORIZON_DAYS);

  const year = Number(cashflow.today.slice(0, 4));
  const month = Number(cashflow.today.slice(5, 7));
  const monthsShown = Array.from({ length: LIST_MONTHS_AHEAD + 1 }, (_, i) => {
    const zero = year * 12 + (month - 1) + i;
    return { year: Math.floor(zero / 12), month: (zero % 12) + 1 };
  });

  const [planned, accounts] = await Promise.all([
    prisma.plannedItem.findMany({
      where: { userId, OR: monthsShown.map((m) => ({ year: m.year, month: m.month })) },
      orderBy: [{ year: "asc" }, { month: "asc" }],
      select: {
        id: true,
        description: true,
        direction: true,
        amount: true,
        matchedAmount: true,
        status: true,
        year: true,
        month: true,
        dueDay: true,
        windowFromDay: true,
        windowToDay: true,
        anchorMonthEnd: true,
        recurringSeriesId: true,
        bankAccountId: true,
      },
    }),
    prisma.bankAccount.findMany({
      where: { userId, isActive: true },
      select: { id: true },
    }),
  ]);
  const categories = await prisma.category.findMany({
    where: { isActive: true, OR: [{ userId }, { userId: null }] },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, color: true, parentId: true },
  });
  const accountNames = new Map(
    (
      await prisma.bankAccount.findMany({
        where: { userId },
        select: { id: true, name: true },
      })
    ).map((a) => [a.id, a.name]),
  );
  void accounts;

  const rows: PlannedRowVM[] = planned
    .map((p) => {
      const ym = { year: p.year, month: p.month };
      const window =
        p.dueDay != null && !p.anchorMonthEnd
          ? { fromDay: p.dueDay, toDay: p.dueDay }
          : resolveWindow(p, ym);
      return {
        id: p.id,
        description: p.description,
        direction: p.direction,
        amount: Number(p.amount.toString()),
        date: isoDate(ym, window.fromDay),
        windowLabel:
          window.fromDay !== window.toDay ? `${window.fromDay}–${window.toDay}` : null,
        status: p.status,
        matchedAmount: p.matchedAmount ? Number(p.matchedAmount.toString()) : null,
        fromSeries: p.recurringSeriesId !== null,
        accountName: p.bankAccountId ? (accountNames.get(p.bankAccountId) ?? null) : null,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const dayLabel = (iso: string) =>
    formatDate(iso, language, "UTC", { day: "numeric", month: "short" });
  const chartData = cashflow.consolidated.map((p) => ({
    label: dayLabel(p.date),
    balance: p.balance,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="Upcoming" />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {cashflow.accounts.map((account) => (
          <Card key={account.accountId}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{account.accountName}</CardTitle>
              {account.breach ? (
                <AlertTriangle className="h-4 w-4 text-destructive" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-success" />
              )}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(account.startingBalance, currency, locale)}
              </div>
              {account.breach ? (
                <p className="text-xs text-destructive">
                  Projected {formatCurrency(account.breach.balance, currency, locale)} on{" "}
                  {dayLabel(account.breach.date)} (
                  {account.breach.daysAway === 1
                    ? "tomorrow"
                    : `in ${account.breach.daysAway} days`}
                  ). A transfer of{" "}
                  {formatCurrency(
                    Math.ceil(cashflow.threshold - account.minBalance),
                    currency,
                    locale,
                  )}{" "}
                  would keep it covered.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Covers the next {CASHFLOW_HORIZON_DAYS} days · lowest{" "}
                  {formatCurrency(account.minBalance, currency, locale)} on{" "}
                  {dayLabel(account.minDate)}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <PlannedList
        rows={rows}
        categories={categories}
        currency={currency}
        locale={locale}
        dateLocale={language}
        defaultYear={year}
        defaultMonth={month}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Projected balance · next {CASHFLOW_HORIZON_DAYS} days
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BalanceForecastChart
            data={chartData}
            currency={currency}
            locale={locale}
            threshold={cashflow.threshold}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            All accounts combined, day by day: planned charges on their
            window&apos;s first day, expected income on its last, plus your
            average variable spend. Per-account coverage is above — a combined
            total can look fine while one account misses rent.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
