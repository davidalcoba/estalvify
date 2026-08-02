"use client";

import { Check, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { RecurringItem } from "@/lib/recurring/recurring-dto";
import { cadenceLabel } from "./labels";

export interface RecurringRowHandlers {
  onConfirm: (item: RecurringItem) => void;
  onIgnore: (item: RecurringItem) => void;
  onReset: (item: RecurringItem) => void;
  disabled?: boolean;
}

// One detected series: merchant, category, cadence, next date, amount, and the
// actions available for its current status. Shared by both device views.
export function RecurringItemRow({
  item,
  currency,
  locale,
  dateLocale,
  onConfirm,
  onIgnore,
  onReset,
  disabled,
}: {
  item: RecurringItem;
  currency: string;
  locale: string;
  dateLocale: string;
} & RecurringRowHandlers) {
  const income = item.direction === "CREDIT";
  const ignored = item.status === "IGNORED";

  return (
    <div className={`flex items-center gap-3 py-3 ${ignored ? "opacity-60" : ""}`}>
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: item.categoryColor ?? "var(--muted-foreground)" }}
        aria-hidden
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{item.displayName}</span>
          {item.categoryName && (
            <Badge variant="outline" className="hidden sm:inline-flex">
              {item.categoryName}
            </Badge>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {cadenceLabel[item.cadence]} · next{" "}
          {formatDate(item.nextExpected, dateLocale, "UTC", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}{" "}
          · {item.occurrences}×
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className={`text-sm font-medium tabular-nums ${income ? "text-success" : ""}`}>
          {income ? "+" : ""}
          {formatCurrency(item.averageAmount, currency, locale)}
        </p>
        <p className="text-xs text-muted-foreground">{cadenceLabel[item.cadence].toLowerCase()}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {item.status === "SUGGESTED" && (
          <>
            <Button size="sm" onClick={() => onConfirm(item)} disabled={disabled}>
              <Check className="h-4 w-4" />
              <span className="hidden sm:inline">Confirm</span>
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => onIgnore(item)}
              disabled={disabled}
              aria-label="Ignore"
              title="Ignore"
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        )}

        {item.status === "CONFIRMED" && (
          <>
            <Badge variant="success-soft">Confirmed</Badge>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => onReset(item)}
              disabled={disabled}
              aria-label="Undo confirmation"
              title="Undo"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </>
        )}

        {item.status === "IGNORED" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onReset(item)}
            disabled={disabled}
          >
            <RotateCcw className="h-4 w-4" />
            <span className="hidden sm:inline">Restore</span>
          </Button>
        )}
      </div>
    </div>
  );
}
