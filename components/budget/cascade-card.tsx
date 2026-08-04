// Server component: the v3 monthly cascade — the expected RESULT is the goal.
// Savings is not a line: it is the derived consequence (the reconciliation
// card shows it as the consolidated balance change).

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  const { cascade, reconciliation } = status;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          Monthly cascade
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
            <dt className="text-muted-foreground">Variable budget</dt>
            <dd className="tabular-nums">−{fmt(cascade.variableBudget)}</dd>
          </div>
          <div className="flex items-center justify-between border-t pt-1.5 font-medium">
            <dt>Expected result — the goal</dt>
            <dd
              className={`tabular-nums ${cascade.expectedResult < 0 ? "text-destructive" : "text-success"}`}
            >
              {cascade.expectedResult >= 0 ? "+" : "−"}
              {fmt(Math.abs(cascade.expectedResult))}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          Want to save more? Lower the variable budget until this number is the
          one you want. Savings itself is derived — see the reconciliation.
        </p>

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
              <dt className="text-muted-foreground">
                Real savings (consolidated balance change)
              </dt>
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
              Flows ({fmt(reconciliation.actualResult)}) and the balance change (
              {fmt(reconciliation.consolidatedDelta ?? 0)}) differ by{" "}
              {fmt(Math.abs(reconciliation.discrepancy))} — uncaptured flow
              somewhere: an unsynced account or a sync hole.
            </p>
          )}
      </CardContent>
    </Card>
  );
}
