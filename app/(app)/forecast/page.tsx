// Forecast — projected spending and balance from historical averages + recurring.

import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { currentYearMonth, monthRange } from "@/lib/analytics/spending";
import { lastNMonths, forwardMonths, monthlyIncomeExpenses } from "@/lib/analytics/trends";
import { averageMonthly, projectBalances, projectMonthEndSpend } from "@/lib/analytics/forecast";
import { daysBetween } from "@/lib/recurring/detect";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { BalanceForecastChart } from "@/components/reports/balance-forecast-chart";
import { TrendingUp, LineChart, CalendarClock } from "lucide-react";

export const metadata: Metadata = { title: "Forecast" };

const HISTORY_MONTHS = 6;
const HORIZON_MONTHS = 6;
const UPCOMING_HORIZON_DAYS = 45;

export default async function ForecastPage() {
  const session = await auth();
  const userId = session!.user.id;
  const { locale, language, timezone, currency } = await getUserPrefs(userId);

  const { year, month } = currentYearMonth(timezone);
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const fullMonths = lastNMonths(prev.year, prev.month, HISTORY_MONTHS);
  const trendStart = monthRange(fullMonths[0].year, fullMonths[0].month).start;

  const [accounts, trendTx, recurring] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { userId, isActive: true },
      select: { balances: { orderBy: { date: "desc" }, take: 1, select: { balance: true } } },
    }),
    prisma.transaction.findMany({
      where: { userId, valueDate: { gte: trendStart } },
      select: { amount: true, direction: true, valueDate: true },
    }),
    prisma.recurringSeries.findMany({
      where: { userId, status: "CONFIRMED", nextExpectedDate: { not: null } },
      select: {
        merchantKey: true,
        displayName: true,
        direction: true,
        averageAmount: true,
        nextExpectedDate: true,
      },
    }),
  ]);

  const hasData = accounts.length > 0 || trendTx.length > 0;

  const netWorth = accounts.reduce(
    (sum, a) => sum + (a.balances[0] ? Number(a.balances[0].balance.toString()) : 0),
    0
  );

  const rows = trendTx.map((t) => ({
    amount: Number(t.amount.toString()),
    direction: t.direction,
    valueDate: t.valueDate.toISOString(),
  }));
  const trend = monthlyIncomeExpenses(rows, fullMonths);
  const avg = averageMonthly(trend);
  const current = monthlyIncomeExpenses(rows, [{ year, month }])[0];

  const projected = projectBalances(netWorth, avg.net, forwardMonths(year, month, HORIZON_MONTHS));

  // This month's projected spend by linear extrapolation.
  const dayOfMonth = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone, day: "2-digit" }).format(new Date())
  );
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const projectedSpend = projectMonthEndSpend(current.expenses, dayOfMonth, daysInMonth);

  const monthShort = (y: number, m: number) =>
    formatDate(new Date(Date.UTC(y, m - 1, 1)), language, "UTC", { month: "short" });
  const chartData = [
    { label: monthShort(year, month), balance: Math.round(netWorth * 100) / 100 },
    ...projected.map((p) => ({ label: monthShort(p.year, p.month), balance: p.balance })),
  ];

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const upcoming = recurring
    .map((r) => ({
      displayName: r.displayName,
      direction: r.direction,
      amount: Number(r.averageAmount.toString()),
      date: r.nextExpectedDate!.toISOString().slice(0, 10),
    }))
    .map((r) => ({ ...r, inDays: daysBetween(today, r.date) }))
    .filter((r) => r.inDays >= 0 && r.inDays <= UPCOMING_HORIZON_DAYS)
    .sort((a, b) => a.inDays - b.inDays)
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <PageHeader title="Forecast" />

      {!hasData ? (
        <EmptyState
          icon={LineChart}
          title="Not enough history yet"
          description="A few months of transactions are needed to forecast."
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Kpi title="Projected spend this month" icon={<CalendarClock className="h-4 w-4 text-muted-foreground" />}>
              <div className="text-2xl font-bold">{formatCurrency(projectedSpend, currency, locale)}</div>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(current.expenses, currency, locale)} so far · avg{" "}
                {formatCurrency(avg.expenses, currency, locale)}
              </p>
            </Kpi>

            <Kpi title="Avg monthly net" icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}>
              <div className={`text-2xl font-bold ${avg.net >= 0 ? "text-success" : "text-destructive"}`}>
                {avg.net >= 0 ? "+" : "−"}
                {formatCurrency(Math.abs(avg.net), currency, locale)}
              </div>
              <p className="text-xs text-muted-foreground">Over the last {HISTORY_MONTHS} months</p>
            </Kpi>

            <Kpi title="Net worth now" icon={<LineChart className="h-4 w-4 text-muted-foreground" />}>
              <div className="text-2xl font-bold">{formatCurrency(netWorth, currency, locale)}</div>
              <p className="text-xs text-muted-foreground">Across all accounts</p>
            </Kpi>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Projected balance · next {HORIZON_MONTHS} months</CardTitle>
            </CardHeader>
            <CardContent>
              <BalanceForecastChart data={chartData} currency={currency} locale={locale} />
              <p className="mt-2 text-xs text-muted-foreground">
                Assumes your average monthly net of{" "}
                {avg.net >= 0 ? "+" : "−"}
                {formatCurrency(Math.abs(avg.net), currency, locale)} continues. A projection, not a guarantee.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upcoming recurring charges</CardTitle>
            </CardHeader>
            <CardContent>
              {upcoming.length > 0 ? (
                <ul className="divide-y">
                  {upcoming.map((r, i) => (
                    <li key={`${r.displayName}-${i}`} className="flex items-center gap-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{r.displayName}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(r.date, language, "UTC", { day: "numeric", month: "short" })}
                      </span>
                      <span
                        className={`w-24 shrink-0 text-right tabular-nums ${
                          r.direction === "CREDIT" ? "text-success" : ""
                        }`}
                      >
                        {r.direction === "CREDIT" ? "+" : "−"}
                        {formatCurrency(r.amount, currency, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No upcoming recurring charges. Confirm recurring series to see them here.
                </p>
              )}
            </CardContent>
          </Card>
        </>
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
