// Server component: the v4 monthly cascade — the savings TARGET is the input
// and the variable budget is the residue. One mode only: move the target,
// watch the variable move.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/formatters";
import type { MonthStatus } from "@/lib/budget/month-status";
import { SavingsTargetInput } from "@/components/budget/savings-target-input";
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
  const { cascade, reconciliation } = status;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          Cascade
          {status.provisional && (
            <Badge variant="secondary" className="ml-2 align-middle text-xs">
              Provisional
            </Badge>
          )}
        </CardTitle>
        <Layers className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Expected income</dt>
            <dd className="tabular-nums text-success">+{fmt(cascade.expectedIncome)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Expected charges</dt>
            <dd className="tabular-nums">−{fmt(cascade.expectedCharges)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Fund quotas (rollover)</dt>
            <dd className="tabular-nums">−{fmt(cascade.rolloverQuotas)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Savings target</dt>
            <dd>
              <SavingsTargetInput
                year={status.year}
                month={status.month}
                value={cascade.savingsTarget}
                currency={currency}
                locale={locale}
              />
            </dd>
          </div>
          <div className="flex items-center justify-between border-t pt-1.5 font-medium">
            <dt>Variable budget</dt>
            <dd className="tabular-nums">{fmt(cascade.variableBudget)}</dd>
          </div>
          {Math.abs(cascade.assignmentGap) > 1 && (
            <p className="text-xs text-warning">
              Lines {fmt(cascade.assignedVariable)} · gap{" "}
              {cascade.assignmentGap > 0 ? "+" : "−"}
              {fmt(Math.abs(cascade.assignmentGap))}
            </p>
          )}
        </dl>
        <dl className="space-y-1.5 border-t pt-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Actual result (accrual)</dt>
            <dd className="tabular-nums">
              {reconciliation.actualResult >= 0 ? "+" : "−"}
              {fmt(Math.abs(reconciliation.actualResult))}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Performance vs plan</dt>
            <dd
              className={`tabular-nums ${
                reconciliation.performance >= 0 ? "text-success" : "text-destructive"
              }`}
            >
              {reconciliation.performance >= 0 ? "+" : "−"}
              {fmt(Math.abs(reconciliation.performance))}
            </dd>
          </div>
          {reconciliation.consolidatedDelta != null && (
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Real savings (balance change)</dt>
              <dd
                className={`tabular-nums ${
                  reconciliation.consolidatedDelta >= 0 ? "text-success" : "text-destructive"
                }`}
              >
                {reconciliation.consolidatedDelta >= 0 ? "+" : "−"}
                {fmt(Math.abs(reconciliation.consolidatedDelta))}
              </dd>
            </div>
          )}
          {reconciliation.consolidatedBalance != null && (
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Total balance (all accounts)</dt>
              <dd className="tabular-nums">{fmt(reconciliation.consolidatedBalance)}</dd>
            </div>
          )}
          {reconciliation.monthsOfCushion != null && (
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Months of cushion</dt>
              <dd className="tabular-nums">{reconciliation.monthsOfCushion}</dd>
            </div>
          )}
        </dl>

        {reconciliation.discrepancy != null &&
          Math.abs(reconciliation.discrepancy) > 1 && (
            <p className="text-xs text-warning">
              Flows vs balance gap: {fmt(Math.abs(reconciliation.discrepancy))}
            </p>
          )}
      </CardContent>
    </Card>
  );
}
