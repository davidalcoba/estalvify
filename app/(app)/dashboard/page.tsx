// Dashboard — global financial overview with real data.
// Net worth, income vs expenses (this month + 6-month trend), top categories,
// and transactions pending review.

import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { formatDate, formatCurrency } from "@/lib/formatters";
import {
  currentYearMonth,
  monthRange,
  buildMonthlySpendingWhere,
  aggregateSpendingByCategory,
} from "@/lib/analytics/spending";
import {
  lastNMonths,
  monthlyIncomeExpenses,
  topCategories,
} from "@/lib/analytics/trends";
import { buildMonthStatus } from "@/lib/plan/month-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { IncomeExpensesChart } from "@/components/reports/income-expenses-chart";
import { CategoryBars } from "@/components/reports/category-bars";
import { AvailableCard } from "@/components/plan/available-card";
import { TrendingUp, Wallet, Tag } from "lucide-react";

export const metadata: Metadata = { title: "Dashboard" };

const TREND_MONTHS = 6;

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;
  const { locale, language, timezone, currency } = await getUserPrefs(userId);

  const { year, month } = currentYearMonth(timezone);
  const months = lastNMonths(year, month, TREND_MONTHS);
  const rangeStart = monthRange(months[0].year, months[0].month).start;

  const monthStatusPromise = buildMonthStatus(userId, timezone);
  const [accounts, trendTx, spendRows, categories, toCategorize] =
    await Promise.all([
      prisma.bankAccount.findMany({
        where: { userId, isActive: true },
        select: {
          balances: {
            orderBy: { date: "desc" },
            take: 1,
            select: { balance: true },
          },
        },
      }),
      prisma.transaction.findMany({
        where: { userId, valueDate: { gte: rangeStart } },
        select: {
          amount: true,
          direction: true,
          valueDate: true,
          // Category kind so transfers can be excluded from income/expense totals.
          categorization: { select: { category: { select: { kind: true } } } },
        },
      }),
      prisma.transaction.findMany({
        where: buildMonthlySpendingWhere(userId, year, month),
        select: {
          amount: true,
          categorization: { select: { categoryId: true } },
          splits: { select: { amount: true, categoryId: true } },
        },
      }),
      prisma.category.findMany({
        where: { isActive: true, OR: [{ userId }, { userId: null }] },
        select: { id: true, name: true, color: true },
      }),
      prisma.transaction.count({
        where: {
          userId,
          OR: [
            { categorization: null },
            { categorization: { status: "REJECTED" } },
          ],
        },
      }),
    ]);

  const hasAccounts = accounts.length > 0;
  const netWorth = accounts.reduce(
    (sum, a) =>
      sum + (a.balances[0] ? Number(a.balances[0].balance.toString()) : 0),
    0,
  );

  const trend = monthlyIncomeExpenses(
    trendTx.map((t) => ({
      amount: Number(t.amount.toString()),
      direction: t.direction,
      valueDate: t.valueDate.toISOString(),
      categoryKind: t.categorization?.category?.kind ?? null,
    })),
    months,
  );
  const thisMonth = trend[trend.length - 1];

  const spendingByCategory = aggregateSpendingByCategory(spendRows);
  const topCats = topCategories(spendingByCategory, categories, 6);

  const monthLabel = (y: number, m: number) =>
    formatDate(new Date(Date.UTC(y, m - 1, 1)), language, "UTC", {
      month: "short",
    });
  const chartData = trend.map((t) => ({
    label: monthLabel(t.year, t.month),
    income: t.income,
    expenses: t.expenses,
  }));

  const firstName = session?.user?.name?.split(" ")[0] ?? "there";
  const monthStatus = await monthStatusPromise;

  return (
    <div className="space-y-6">
      <PageHeader title={`Good morning, ${firstName} 👋`} />

      {/* KPI Cards — available-to-spend first: it is THE number. */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <AvailableCard
          status={monthStatus}
          currency={currency}
          locale={locale}
        />

        <Kpi
          title="Net Worth"
          icon={<Wallet className="h-4 w-4 text-muted-foreground" />}
        >
          <div className="text-2xl font-bold">
            {formatCurrency(netWorth, currency, locale)}
          </div>
          <p className="text-xs text-muted-foreground">Across all accounts</p>
        </Kpi>

        <Kpi
          title="Income this month"
          icon={<TrendingUp className="h-4 w-4 text-success" />}
        >
          <div className="text-2xl font-bold text-success">
            +{formatCurrency(thisMonth.income, currency, locale)}
          </div>
          <p className="text-xs text-muted-foreground">Money in this month</p>
        </Kpi>

        <Kpi
          title="To categorize"
          icon={<Tag className="h-4 w-4 text-brand" />}
        >
          <div className="text-2xl font-bold">{toCategorize}</div>
          <p className="text-xs text-muted-foreground">
            Transactions pending review
          </p>
        </Kpi>
      </div>

      {hasAccounts ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Income vs expenses</CardTitle>
            </CardHeader>
            <CardContent>
              <IncomeExpensesChart
                data={chartData}
                currency={currency}
                locale={locale}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Top categories this month
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topCats.length > 0 ? (
                <CategoryBars
                  items={topCats}
                  currency={currency}
                  locale={locale}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No categorized spending yet this month.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <EmptyState
          icon={Wallet}
          title="Connect your first bank account"
          description="Link a bank to start tracking. Syncs daily."
        >
          <Button asChild variant="outline">
            <Link href="/accounts">Go to Accounts →</Link>
          </Button>
        </EmptyState>
      )}
    </div>
  );
}

function Kpi({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
