"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/formatters";
import type { BudgetTotals } from "@/lib/budget/budget-progress";
import { statusIndicatorClass, statusTextClass } from "./status";

// Top-of-page summary: planned / spent / remaining figures plus an overall
// status-colored progress bar.
export function BudgetSummary({
  totals,
  currency,
  locale,
}: {
  totals: BudgetTotals;
  currency: string;
  locale: string;
}) {
  const over = totals.status === "over";
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Figure label="Planned" value={formatCurrency(totals.planned, currency, locale)} />
          <Figure label="Spent" value={formatCurrency(totals.spent, currency, locale)} />
          <Figure
            label={over ? "Over" : "Remaining"}
            value={formatCurrency(Math.abs(totals.remaining), currency, locale)}
            className={statusTextClass[totals.status]}
          />
        </div>
        <Progress
          value={totals.percent}
          indicatorClassName={statusIndicatorClass[totals.status]}
          className="h-2"
        />
      </CardContent>
    </Card>
  );
}

function Figure({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`truncate text-lg font-semibold tabular-nums ${className ?? ""}`}>
        {value}
      </p>
    </div>
  );
}
