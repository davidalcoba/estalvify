"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import type { UnbudgetedRow } from "@/lib/budget/budget-dto";

// Categories the user spent in this month but hasn't budgeted. Each offers a
// one-click "budget it" that pre-fills the dialog with the amount already spent.
export function UnbudgetedList({
  rows,
  currency,
  locale,
  onBudget,
  disabled,
}: {
  rows: UnbudgetedRow[];
  currency: string;
  locale: string;
  onBudget: (row: UnbudgetedRow) => void;
  disabled?: boolean;
}) {
  if (rows.length === 0) return null;

  return (
    <div className="space-y-1">
      <h3 className="text-sm font-medium text-muted-foreground">Not budgeted yet</h3>
      <p className="text-xs text-muted-foreground">
        You spent in these categories this month without a plan.
      </p>
      <ul className="mt-2 divide-y rounded-xl border">
        {rows.map((row) => (
          <li key={row.categoryId} className="flex items-center gap-3 px-3 py-2.5">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: row.categoryColor }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-sm">{row.categoryName}</span>
            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
              {formatCurrency(row.spent, currency, locale)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => onBudget(row)}
              disabled={disabled}
            >
              <Plus className="size-3" />
              Budget
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
