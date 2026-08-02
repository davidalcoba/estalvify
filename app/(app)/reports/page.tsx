// Reports — spending breakdowns, trends and income vs expenses, from real data.

import type { Metadata } from "next";
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
import { merchantDisplayName } from "@/lib/recurring/detect";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { IncomeExpensesChart } from "@/components/reports/income-expenses-chart";
import { CategoryBreakdownChart } from "@/components/reports/category-breakdown-chart";
import { BarChart3 } from "lucide-react";

export const metadata: Metadata = { title: "Reports" };

const TREND_MONTHS = 12;
const TOP_MERCHANTS = 6;

export default async function ReportsPage() {
  const session = await auth();
  const userId = session!.user.id;
  const { locale, language, timezone, currency } = await getUserPrefs(userId);

  const { year, month } = currentYearMonth(timezone);
  const months = lastNMonths(year, month, TREND_MONTHS);
  const rangeStart = monthRange(months[0].year, months[0].month).start;
  const { start: monthStart, end: monthEnd } = monthRange(year, month);

  const [trendTx, spendRows, categories, monthDebits] = await Promise.all([
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
      },
    }),
    prisma.category.findMany({
      where: { isActive: true, OR: [{ userId }, { userId: null }] },
      select: { id: true, name: true, color: true },
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        direction: "DEBIT",
        valueDate: { gte: monthStart, lt: monthEnd },
      },
      select: { amount: true, description: true, remittanceInfo: true },
    }),
  ]);

  const hasData = trendTx.length > 0;

  const trend = monthlyIncomeExpenses(
    trendTx.map((t) => ({
      amount: Number(t.amount.toString()),
      direction: t.direction,
      valueDate: t.valueDate.toISOString(),
      categoryKind: t.categorization?.category?.kind ?? null,
    })),
    months,
  );
  const monthLabel = (y: number, m: number) =>
    formatDate(new Date(Date.UTC(y, m - 1, 1)), language, "UTC", {
      month: "short",
    });
  const chartData = trend.map((t) => ({
    label: monthLabel(t.year, t.month),
    income: t.income,
    expenses: t.expenses,
  }));

  const spendingByCategory = aggregateSpendingByCategory(spendRows);
  const slices = topCategories(spendingByCategory, categories, 8).map((c) => ({
    name: c.name,
    value: c.amount,
    color: c.color,
  }));

  // Top merchants this month (all debits, categorized or not).
  const merchantTotals = new Map<string, number>();
  for (const tx of monthDebits) {
    const name =
      merchantDisplayName(tx.description, tx.remittanceInfo) || "Unknown";
    merchantTotals.set(
      name,
      (merchantTotals.get(name) ?? 0) + Math.abs(Number(tx.amount.toString())),
    );
  }
  const topMerchants = [...merchantTotals.entries()]
    .map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, TOP_MERCHANTS);

  const thisMonthLabel = formatDate(
    new Date(Date.UTC(year, month - 1, 1)),
    language,
    "UTC",
    {
      month: "long",
      year: "numeric",
    },
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" />

      {!hasData ? (
        <EmptyState
          icon={BarChart3}
          title="No data yet"
          description="Sync and categorize transactions to see reports."
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Income vs expenses · last 12 months
              </CardTitle>
            </CardHeader>
            <CardContent>
              <IncomeExpensesChart
                data={chartData}
                currency={currency}
                locale={locale}
                height={300}
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Spending by category ·{" "}
                  <span className="capitalize">{thisMonthLabel}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {slices.length > 0 ? (
                  <CategoryBreakdownChart
                    data={slices}
                    currency={currency}
                    locale={locale}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No categorized spending this month yet.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Top merchants · this month
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topMerchants.length > 0 ? (
                  <ul className="divide-y">
                    {topMerchants.map((m) => (
                      <li
                        key={m.name}
                        className="flex items-center gap-3 py-2 text-sm"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {m.name}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {formatCurrency(m.amount, currency, locale)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No spending this month yet.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
