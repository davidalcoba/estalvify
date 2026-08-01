"use client";

import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import type { RecurringSummary } from "@/lib/recurring/recurring-dto";

// Confirmed recurring cost at a glance: monthly expenses, monthly income, and
// how many suggestions still need review.
export function RecurringSummaryCard({
  summary,
  currency,
  locale,
}: {
  summary: RecurringSummary;
  currency: string;
  locale: string;
}) {
  return (
    <Card>
      <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Figure
          label="Recurring / month"
          value={formatCurrency(summary.monthlyExpenses, currency, locale)}
        />
        <Figure
          label="Recurring income / month"
          value={formatCurrency(summary.monthlyIncome, currency, locale)}
          className="text-success"
        />
        <Figure
          label="Confirmed"
          value={`${summary.confirmedCount}${
            summary.suggestedCount > 0 ? ` · ${summary.suggestedCount} to review` : ""
          }`}
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
