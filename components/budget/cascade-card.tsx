// Server component: the monthly cascade — the calculation that makes the
// available number TRUE. The savings goal sits in the commitments block next
// to the rent, never at the end as a result.

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import type { MonthStatus } from "@/lib/budget/month-status";
import { Layers } from "lucide-react";

export function CascadeCard({
  status,
  currency,
  locale,
}: {
  status: MonthStatus;
  currency: string;
  locale: string;
}) {
  const fmt = (n: number) => formatCurrency(n, currency, locale);
  const { cascade } = status;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Monthly cascade</CardTitle>
        <Layers className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Base income</dt>
            <dd className="tabular-nums text-success">
              {cascade.baseIncome > 0 ? (
                `+${fmt(cascade.baseIncome)}`
              ) : (
                <Link href="/settings" className="text-xs text-brand underline-offset-2 hover:underline">
                  Set in Settings
                </Link>
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Planned charges this month</dt>
            <dd className="tabular-nums">−{fmt(cascade.plannedCharges)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Fund quotas (rollover)</dt>
            <dd className="tabular-nums">−{fmt(cascade.rolloverQuotas)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Savings goal</dt>
            <dd className="tabular-nums">
              {cascade.savingsGoal > 0 ? (
                `−${fmt(cascade.savingsGoal)}`
              ) : (
                <Link href="/settings" className="text-xs text-brand underline-offset-2 hover:underline">
                  Set a goal
                </Link>
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between border-t pt-1.5 font-medium">
            <dt>Variable budget</dt>
            <dd
              className={`tabular-nums ${cascade.variableBudget < 0 ? "text-destructive" : ""}`}
            >
              {fmt(cascade.variableBudget)}
            </dd>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <dt>Variable spent so far</dt>
            <dd className="tabular-nums">{fmt(status.variableSpentMonth)}</dd>
          </div>
        </dl>

        {status.extraordinaryIncome > 0 && (
          <p className="border-t pt-3 text-xs text-muted-foreground">
            Extraordinary income this month:{" "}
            <span className="text-success">+{fmt(status.extraordinaryIncome)}</span>{" "}
            above the base — assign it (savings, a fund) before the month
            absorbs it. It never enters averages.
          </p>
        )}

        {status.hasSavingsGoal && status.savings && (
          <p className="border-t pt-3 text-xs text-muted-foreground">
            {status.savings.activity.executed
              ? `Savings transfer executed (${fmt(status.savings.activity.transferredIn)} in). `
              : "Savings transfer not executed yet — the standing order lives at your bank. "}
            {status.savings.netChange != null && (
              <>
                Real savings ({status.savings.accountName}):{" "}
                <span
                  className={
                    status.savings.netChange >= 0 ? "text-success" : "text-destructive"
                  }
                >
                  {status.savings.netChange >= 0 ? "+" : "−"}
                  {fmt(Math.abs(status.savings.netChange))}
                </span>{" "}
                net.
              </>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
