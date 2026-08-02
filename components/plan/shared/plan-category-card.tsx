"use client";

import { Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import type { PlanCategoryGroupVM, PlanEntryVM } from "@/lib/plan/plan-dto";
import { PlanEntryRow } from "./plan-entry-row";
import { statusIndicatorClass, statusTextClass } from "./status";

// One expense category: header with the category name, its planned monthly limit
// vs actual spend (status-colored progress bar), the list of planned items, and
// an "add expense" action for this category.
export function PlanCategoryCard({
  group,
  currency,
  locale,
  dateLocale,
  onAdd,
  onEdit,
  onDelete,
  isDeleting,
  disabled,
}: {
  group: PlanCategoryGroupVM;
  currency: string;
  locale: string;
  dateLocale: string;
  onAdd: (categoryId: string) => void;
  onEdit: (entry: PlanEntryVM) => void;
  onDelete: (entry: PlanEntryVM) => void;
  /** True while that entry's delete is being written. */
  isDeleting?: (entry: PlanEntryVM) => boolean;
  disabled?: boolean;
}) {
  const { row } = group;
  const over = row.status === "over";

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center gap-3">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: group.categoryColor }}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{group.categoryName}</span>
          <span className="shrink-0 text-sm tabular-nums">
            <span className={over ? "font-medium text-destructive" : ""}>
              {formatCurrency(row.spent, currency, locale)}
            </span>
            <span className="text-muted-foreground">
              {" / "}
              {formatCurrency(row.planned, currency, locale)}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-3">
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

        <div className="divide-y border-t">
          {group.items.map((entry) => (
            <PlanEntryRow
              key={entry.id}
              entry={entry}
              currency={currency}
              locale={locale}
              dateLocale={dateLocale}
              onEdit={onEdit}
              onDelete={onDelete}
              deleting={isDeleting?.(entry)}
              disabled={disabled}
            />
          ))}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => onAdd(group.categoryId)}
          disabled={disabled}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add to {group.categoryName}
        </Button>
      </CardContent>
    </Card>
  );
}
