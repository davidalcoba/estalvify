"use client";

import { Pencil, Repeat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { PlanEntryVM } from "@/lib/plan/plan-dto";
import { cadenceLabel } from "./cadence";

// A single planned item: primary label, a cadence/date meta line, the amount
// (income shown positive/green), and edit/delete controls. Shared by the income
// section and each expense category card.
export function PlanEntryRow({
  entry,
  currency,
  locale,
  dateLocale,
  onEdit,
  onDelete,
  disabled,
}: {
  entry: PlanEntryVM;
  currency: string;
  locale: string;
  dateLocale: string;
  onEdit: (entry: PlanEntryVM) => void;
  onDelete: (entry: PlanEntryVM) => void;
  disabled?: boolean;
}) {
  const income = entry.direction === "CREDIT";
  const primary = entry.label || entry.categoryName || (income ? "Income" : "Expense");

  const metaParts: string[] = [cadenceLabel[entry.cadence]];
  if (entry.cadence === "ONE_OFF" && entry.onDate) {
    metaParts.push(
      formatDate(entry.onDate, dateLocale, "UTC", { day: "numeric", month: "short", year: "numeric" })
    );
  } else if (entry.dayOfMonth != null) {
    metaParts.push(`day ${entry.dayOfMonth}`);
  }
  // For non-monthly periodics, show the monthly equivalent so the plan reads clearly.
  if (entry.cadence !== "MONTHLY" && entry.cadence !== "ONE_OFF") {
    metaParts.push(`≈ ${formatCurrency(entry.monthly, currency, locale)}/mo`);
  }

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          {entry.fromRecurring && (
            <Repeat
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-label="From a confirmed recurring series"
            />
          )}
          <span className="truncate">{primary}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">{metaParts.join(" · ")}</p>
      </div>
      <span
        className={`shrink-0 text-sm tabular-nums ${income ? "text-success" : ""}`}
      >
        {income ? "+" : ""}
        {formatCurrency(entry.amount, currency, locale)}
      </span>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onEdit(entry)}
          disabled={disabled}
          aria-label={`Edit ${primary}`}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(entry)}
          disabled={disabled}
          aria-label={`Delete ${primary}`}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
