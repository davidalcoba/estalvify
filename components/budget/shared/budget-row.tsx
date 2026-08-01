"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import type { BudgetRow as BudgetRowVM } from "@/lib/budget/budget-progress";
import { statusIndicatorClass, statusTextClass } from "./status";

// A single budgeted category: colored dot + name, spent / planned, a
// status-colored progress bar, remaining amount, and edit/remove controls.
// Shared by the desktop and mobile views.
export function BudgetRow({
  row,
  currency,
  locale,
  onEdit,
  onRemove,
  disabled,
}: {
  row: BudgetRowVM;
  currency: string;
  locale: string;
  onEdit: (row: BudgetRowVM) => void;
  onRemove: (row: BudgetRowVM) => void;
  disabled?: boolean;
}) {
  const over = row.status === "over";
  return (
    <div className="py-3">
      <div className="flex items-center gap-3">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: row.categoryColor }}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {row.categoryName}
        </span>
        <span className="shrink-0 text-sm tabular-nums">
          <span className={over ? "text-destructive font-medium" : ""}>
            {formatCurrency(row.spent, currency, locale)}
          </span>
          <span className="text-muted-foreground">
            {" / "}
            {formatCurrency(row.planned, currency, locale)}
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onEdit(row)}
            disabled={disabled}
            aria-label={`Edit ${row.categoryName} budget`}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(row)}
            disabled={disabled}
            aria-label={`Remove ${row.categoryName} from budget`}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <Progress
          value={row.percent}
          indicatorClassName={statusIndicatorClass[row.status]}
          className="h-1.5 flex-1"
        />
        <span className={`shrink-0 text-xs tabular-nums ${statusTextClass[row.status]}`}>
          {over
            ? `${formatCurrency(row.spent - row.planned, currency, locale)} over`
            : `${formatCurrency(row.remaining, currency, locale)} left`}
        </span>
      </div>
    </div>
  );
}
