"use client";

import { Card, CardContent } from "@/components/ui/card";
import { BudgetRow } from "@/components/budget/shared/budget-row";
import { UnbudgetedList } from "@/components/budget/shared/unbudgeted-list";
import type { BudgetListViewProps } from "./budget-view-props";

// Desktop layout: budgeted categories grouped in a single card with divided
// rows, then the unbudgeted section below.
export function BudgetDesktopView({
  rows,
  unbudgeted,
  currency,
  locale,
  onEdit,
  onRemove,
  onBudgetUnbudgeted,
  disabled,
}: BudgetListViewProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="divide-y py-1">
          {rows.map((row) => (
            <BudgetRow
              key={row.categoryId}
              row={row}
              currency={currency}
              locale={locale}
              onEdit={onEdit}
              onRemove={onRemove}
              disabled={disabled}
            />
          ))}
        </CardContent>
      </Card>

      <UnbudgetedList
        rows={unbudgeted}
        currency={currency}
        locale={locale}
        onBudget={onBudgetUnbudgeted}
        disabled={disabled}
      />
    </div>
  );
}
