"use client";

import { Card, CardContent } from "@/components/ui/card";
import { BudgetRow } from "@/components/budget/shared/budget-row";
import { UnbudgetedList } from "@/components/budget/shared/unbudgeted-list";
import type { BudgetListViewProps } from "./budget-view-props";

// Mobile layout: each budgeted category is its own card for larger touch
// targets, then the unbudgeted section below.
export function BudgetMobileView({
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
      <div className="space-y-2">
        {rows.map((row) => (
          <Card key={row.categoryId}>
            <CardContent className="py-0">
              <BudgetRow
                row={row}
                currency={currency}
                locale={locale}
                onEdit={onEdit}
                onRemove={onRemove}
                disabled={disabled}
              />
            </CardContent>
          </Card>
        ))}
      </div>

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
