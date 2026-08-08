// Reports — spending breakdowns, trends and income vs expenses, from real data.
// Every card honours the filter bar: a reference month, how many months the
// trend covers, and an optional single bank account. Filters live in the URL.

import type { Metadata } from "next";
import { Suspense } from "react";
import { requireScope } from "@/lib/auth/scope";
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
import type { MonthBucket } from "@/lib/analytics/trends";
import {
  DEFAULT_TREND_WINDOW,
  formatYearMonth,
  isSameMonth,
  parseReportFilters,
  selectableMonths,
} from "@/lib/analytics/report-filters";
import { merchantDisplayName } from "@/lib/transactions/merchant";
import { traceabilityForMonth } from "@/lib/analytics/traceability";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ChartCardSkeleton, ListCardSkeleton } from "@/components/layout/skeletons";
import { IncomeExpensesChart } from "@/components/reports/income-expenses-chart";
import { CategoryBreakdownChart } from "@/components/reports/category-breakdown-chart";
import { ReportFilters } from "@/components/reports/report-filters";
import { BarChart3 } from "lucide-react";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("nav.reports") };
}

const TOP_MERCHANTS = 6;

interface PageProps {
  searchParams: Promise<{ month?: string; trend?: string; accountId?: string }>;
}

// Only the cards re-suspend when a filter changes — the filter bar above stays
// interactive, matching how Transactions behaves.
function ReportsBodySkeleton() {
  return (
    <div className="space-y-6">
      <ChartCardSkeleton titleWidth="w-72" height={300} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ListCardSkeleton rows={6} titleWidth="w-56" />
        <ListCardSkeleton rows={6} titleWidth="w-48" />
      </div>

      {/* Untracked spending */}
      <ListCardSkeleton rows={3} titleWidth="w-64" />
    </div>
  );
}

interface ReportsBodyProps {
  userId: string;
  month: MonthBucket;
  trendMonths: number;
  accountId: string;
}

async function ReportsBody({ userId, month, trendMonths, accountId }: ReportsBodyProps) {
  const t = await getT();
  // getScope is request-cached, so re-resolving here is free; the personal
  // half of the prefs belongs to the acting member, not the data scope.
  const { actorUserId } = await requireScope("read");
  const { locale, language, currency } = await getUserPrefs(userId, actorUserId);

  const months = lastNMonths(month.year, month.month, trendMonths);
  const rangeStart = monthRange(months[0].year, months[0].month).start;
  const { start: monthStart, end: monthEnd } = monthRange(month.year, month.month);
  const accountWhere = accountId ? { bankAccountId: accountId } : {};

  const [trendTx, spendRows, categories, monthDebits] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, valueDate: { gte: rangeStart, lt: monthEnd }, ...accountWhere },
      select: {
        amount: true,
        direction: true,
        valueDate: true,
        // Category kind so transfers can be excluded from income/expense totals.
        categorization: { select: { category: { select: { kind: true } } } },
      },
    }),
    prisma.transaction.findMany({
      where: buildMonthlySpendingWhere(userId, month.year, month.month, accountId),
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
        ...accountWhere,
      },
      select: {
        amount: true,
        description: true,
        remittanceInfo: true,
        categorization: { select: { category: { select: { kind: true } } } },
      },
    }),
  ]);

  if (trendTx.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title={t("reports.noMatch.title")}
        description={t("reports.noMatch.body")}
      />
    );
  }

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

  // Top merchants in the selected month (all debits, categorized or not).
  const merchantTotals = new Map<string, number>();
  for (const tx of monthDebits) {
    const name =
      merchantDisplayName(tx.description, tx.remittanceInfo) ||
      t("reports.unknownMerchant");
    merchantTotals.set(
      name,
      (merchantTotals.get(name) ?? 0) + Math.abs(Number(tx.amount.toString())),
    );
  }
  const topMerchants = [...merchantTotals.entries()]
    .map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, TOP_MERCHANTS);

  // Untracked share of the month: cash withdrawals + card settlements, minus
  // what splits have explained. Transfers are not spending and stay out.
  const traceability = traceabilityForMonth(
    monthDebits
      .filter((tx) => tx.categorization?.category?.kind !== "TRANSFER")
      .map((tx) => ({
        amount: Math.abs(Number(tx.amount.toString())),
        description: tx.description,
        remittanceInfo: tx.remittanceInfo,
      })),
  );

  const selectedMonthLabel = formatDate(
    new Date(Date.UTC(month.year, month.month - 1, 1)),
    language,
    "UTC",
    {
      month: "long",
      year: "numeric",
    },
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("reports.incomeVsExpenses", { months: trendMonths })}
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base capitalize">
              {t("reports.byCategory", { month: selectedMonthLabel })}
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
                {t("reports.byCategory.empty")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base capitalize">
              {t("reports.topMerchants", { month: selectedMonthLabel })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topMerchants.length > 0 ? (
              <ul className="divide-y">
                {topMerchants.map((m) => (
                  <li
                    key={m.name}
                    className="flex min-w-0 items-center gap-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">{m.name}</span>
                    <span className="shrink-0 whitespace-nowrap tabular-nums text-muted-foreground">
                      {formatCurrency(m.amount, currency, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("reports.topMerchants.empty")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base capitalize">
            {t("reports.untracked", { month: selectedMonthLabel })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
              className={`text-2xl font-bold tabular-nums ${
                traceability.untrackedRatio > 0.05 ? "text-warning" : ""
              }`}
            >
              {(traceability.untrackedRatio * 100).toFixed(1)}%
            </span>
            <span className="text-sm text-muted-foreground">
              {t("reports.untracked.summary", {
                untracked: formatCurrency(traceability.untracked, currency, locale),
                total: formatCurrency(traceability.totalSpend, currency, locale),
              })}
            </span>
          </div>
          <dl className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-3">
            <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-start">
              <dt className="text-muted-foreground">{t("reports.untracked.atm")}</dt>
              <dd className="tabular-nums">
                {formatCurrency(traceability.cashWithdrawn, currency, locale)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-start">
              <dt className="text-muted-foreground">{t("reports.untracked.card")}</dt>
              <dd className="tabular-nums">
                {formatCurrency(traceability.cardSettled, currency, locale)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-start">
              <dt className="text-muted-foreground">
                {t("reports.untracked.explained")}
              </dt>
              <dd className="tabular-nums text-success">
                {formatCurrency(traceability.explained, currency, locale)}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            {t("reports.untracked.note")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const t = await getT();
  const { dataUserId: userId, actorUserId } = await requireScope("read");
  const params = await searchParams;
  const { language, timezone } = await getUserPrefs(userId, actorUserId);

  const current = currentYearMonth(timezone);

  // Fetched at page level so the filter bar renders without a skeleton and
  // stays usable while the cards below reload — and before the filters are
  // parsed, because the account filter is validated against this list.
  const [accounts, anyTransaction] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { userId, isActive: true },
      select: { id: true, name: true, iban: true },
      orderBy: { name: "asc" },
    }),
    prisma.transaction.findFirst({ where: { userId }, select: { id: true } }),
  ]);

  const { month, trendMonths, accountId } = parseReportFilters(
    params,
    current,
    accounts.map((a) => a.id),
  );

  const monthOptions = selectableMonths(current).map((m) => ({
    value: formatYearMonth(m),
    label: formatDate(new Date(Date.UTC(m.year, m.month - 1, 1)), language, "UTC", {
      month: "long",
      year: "numeric",
    }),
  }));

  const isFiltered =
    !isSameMonth(month, current) ||
    trendMonths !== DEFAULT_TREND_WINDOW ||
    accountId !== "";

  // Remounting the boundary on a filter change swaps in the skeleton while the
  // new data loads, instead of leaving the previous numbers on screen.
  const bodyKey = `${formatYearMonth(month)}-${trendMonths}-${accountId}`;

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.reports")} />

      {!anyTransaction ? (
        <EmptyState
          icon={BarChart3}
          title={t("reports.empty.title")}
          description={t("reports.empty.body")}
        />
      ) : (
        <>
          <Suspense>
            <ReportFilters
              month={formatYearMonth(month)}
              trend={trendMonths}
              accountId={accountId}
              months={monthOptions}
              accounts={accounts}
              isFiltered={isFiltered}
            />
          </Suspense>

          <Suspense key={bodyKey} fallback={<ReportsBodySkeleton />}>
            <ReportsBody
              userId={userId}
              month={month}
              trendMonths={trendMonths}
              accountId={accountId}
            />
          </Suspense>
        </>
      )}
    </div>
  );
}
