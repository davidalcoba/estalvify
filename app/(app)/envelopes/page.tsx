// Stock envelopes — the labeled split of the savings balance, with the number
// that changes a decision: months of cushion. Moving 1.000 € to checking drops
// it from 6.0 to 5.9, and now that is visible.

import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { formatCurrency } from "@/lib/formatters";
import { monthsOfCushion } from "@/lib/budget/weekly";
import { buildMonthStatus } from "@/lib/budget/month-status";
import { lastNMonths, monthlyIncomeExpenses } from "@/lib/analytics/trends";
import { currentYearMonth, monthRange } from "@/lib/analytics/spending";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { EnvelopesManager, type EnvelopeVM } from "@/components/envelopes/envelopes-manager";
import { Shield } from "lucide-react";

export const metadata: Metadata = { title: "Envelopes" };

const SPEND_BASELINE_MONTHS = 6;

export default async function EnvelopesPage() {
  const session = await auth();
  const userId = session!.user.id;
  const prefs = await getUserPrefs(userId);

  const { year, month } = currentYearMonth(prefs.timezone);
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const fullMonths = lastNMonths(prev.year, prev.month, SPEND_BASELINE_MONTHS);
  const trendStart = monthRange(fullMonths[0].year, fullMonths[0].month).start;

  const [status, envelopes, user, trendTx] = await Promise.all([
    buildMonthStatus(userId, prefs.timezone),
    prisma.stockEnvelope.findMany({
      where: { userId },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { savingsAccountId: true },
    }),
    prisma.transaction.findMany({
      where: { userId, valueDate: { gte: trendStart } },
      select: {
        amount: true,
        direction: true,
        valueDate: true,
        categorization: { select: { category: { select: { kind: true } } } },
      },
    }),
  ]);

  let savingsBalance: number | null = null;
  if (user?.savingsAccountId) {
    const account = await prisma.bankAccount.findFirst({
      where: { id: user.savingsAccountId, userId },
      select: {
        balances: { orderBy: { date: "desc" }, take: 1, select: { balance: true } },
      },
    });
    savingsBalance = account?.balances[0]
      ? Number(account.balances[0].balance.toString())
      : null;
  }

  const trend = monthlyIncomeExpenses(
    trendTx.map((t) => ({
      amount: Number(t.amount.toString()),
      direction: t.direction,
      valueDate: t.valueDate.toISOString(),
      categoryKind: t.categorization?.category?.kind ?? null,
    })),
    fullMonths,
  );
  const avgMonthlySpend =
    trend.length > 0
      ? trend.reduce((sum, m) => sum + m.expenses, 0) / trend.length
      : 0;

  const rolloverTotal = status.funds.reduce((sum, f) => sum + Math.max(0, f.balance), 0);
  const cushion =
    savingsBalance != null
      ? monthsOfCushion(savingsBalance, rolloverTotal, avgMonthlySpend)
      : null;

  const vms: EnvelopeVM[] = envelopes.map((e) => ({
    id: e.id,
    name: e.name,
    amount: Number(e.amount.toString()),
    locked: e.locked,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="Envelopes" />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Months of cushion</CardTitle>
          <Shield className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {cushion != null ? (
            <>
              <div className="text-3xl font-bold tabular-nums">{cushion}</div>
              <p className="mt-1 text-xs text-muted-foreground">
                ({formatCurrency(savingsBalance ?? 0, prefs.currency, prefs.locale)} savings −{" "}
                {formatCurrency(rolloverTotal, prefs.currency, prefs.locale)} already earmarked
                in funds) ÷ {formatCurrency(Math.round(avgMonthlySpend), prefs.currency, prefs.locale)}{" "}
                average monthly spend. Every transfer back to checking moves this number.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Pick your savings account in{" "}
              <Link href="/settings" className="text-brand underline-offset-2 hover:underline">
                Settings
              </Link>{" "}
              to see how many months the cushion covers.
            </p>
          )}
        </CardContent>
      </Card>

      <EnvelopesManager
        envelopes={vms}
        fundBalances={status.funds.map((f) => ({ name: f.categoryName, balance: f.balance }))}
        savingsBalance={savingsBalance}
        currency={prefs.currency}
        locale={prefs.locale}
      />
    </div>
  );
}
