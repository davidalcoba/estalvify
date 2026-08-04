// Server component: the month's commitments, savings first. The point of the
// layout is the ORDER — the savings goal sits between the committed charges
// and the variable budget, as a charge, so what's "available" is what remains
// after saving, never the other way round.

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import type { MonthStatus } from "@/lib/plan/month-status";
import { CheckCircle2, CircleDashed, PiggyBank } from "lucide-react";

export function CommitmentsCard({
  status,
  currency,
  locale,
}: {
  status: MonthStatus;
  currency: string;
  locale: string;
}) {
  const { commitments, savings } = status;
  const fmt = (n: number) => formatCurrency(n, currency, locale);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">This month&apos;s commitments</CardTitle>
        <PiggyBank className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Fixed income</dt>
            <dd className="tabular-nums text-success">+{fmt(commitments.fixedIncome)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Committed charges</dt>
            <dd className="tabular-nums">−{fmt(commitments.committedExpenses)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Savings goal</dt>
            <dd className="tabular-nums">
              {commitments.savingsGoal > 0 ? (
                `−${fmt(commitments.savingsGoal)}`
              ) : (
                <Link href="/settings" className="text-xs text-brand underline-offset-2 hover:underline">
                  Set a goal
                </Link>
              )}
            </dd>
          </div>
          {commitments.sinkingContribution > 0 && (
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Sinking funds</dt>
              <dd className="tabular-nums">−{fmt(commitments.sinkingContribution)}</dd>
            </div>
          )}
          <div className="flex items-center justify-between border-t pt-1.5 font-medium">
            <dt>Variable budget</dt>
            <dd
              className={`tabular-nums ${commitments.variableBudget < 0 ? "text-destructive" : ""}`}
            >
              {fmt(commitments.variableBudget)}
            </dd>
          </div>
        </dl>

        {status.hasSavingsGoal && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
            {savings ? (
              <>
                <span className="flex items-center gap-1">
                  {savings.activity.executed ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      Transfer executed ({fmt(savings.activity.transferredIn)} in)
                    </>
                  ) : (
                    <>
                      <CircleDashed className="h-3.5 w-3.5 text-warning" />
                      Transfer not executed yet — the app can&apos;t move money;
                      the standing order lives at your bank
                    </>
                  )}
                </span>
                {savings.netChange != null && (
                  <span>
                    Real savings this month ({savings.accountName}):{" "}
                    <span
                      className={
                        savings.netChange >= 0 ? "text-success" : "text-destructive"
                      }
                    >
                      {savings.netChange >= 0 ? "+" : "−"}
                      {fmt(Math.abs(savings.netChange))}
                    </span>{" "}
                    net — transfers that bounce back don&apos;t count
                  </span>
                )}
              </>
            ) : (
              <span>
                Pick your savings account in{" "}
                <Link href="/settings" className="text-brand underline-offset-2 hover:underline">
                  Settings
                </Link>{" "}
                to track whether the transfer actually runs.
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
