// Assembles the plain, serializable data the budget page hands to client
// components. Combines stored budget items with computed monthly spending and
// the user's category list. Pure (Decimal→number here), so no Decimal/Date
// crosses the server→client boundary — mirrors `lib/transactions/transaction-dto.ts`.

import {
  buildBudgetRow,
  budgetTotals,
  type BudgetRow,
  type BudgetTotals,
} from "./budget-progress";

export interface BudgetItemRecord {
  categoryId: string;
  plannedAmount: { toString(): string };
  category: { name: string; color: string };
}

export interface CategoryOption {
  id: string;
  name: string;
  color: string;
  parentId: string | null;
}

/** A category with spending this month but no budget item yet. */
export interface UnbudgetedRow {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  spent: number;
}

export interface BudgetData {
  year: number;
  month: number;
  currency: string;
  rows: BudgetRow[];
  totals: BudgetTotals;
  unbudgeted: UnbudgetedRow[];
}

export function buildBudgetData(params: {
  year: number;
  month: number;
  currency: string;
  items: BudgetItemRecord[];
  spendingByCategory: Record<string, number>;
  categories: CategoryOption[];
}): BudgetData {
  const { year, month, currency, items, spendingByCategory, categories } = params;

  const rows = items
    .map((item) =>
      buildBudgetRow(
        {
          categoryId: item.categoryId,
          categoryName: item.category.name,
          categoryColor: item.category.color,
          planned: Number(item.plannedAmount.toString()),
        },
        spendingByCategory[item.categoryId] ?? 0
      )
    )
    .sort((a, b) => b.planned - a.planned || b.spent - a.spent);

  const budgetedIds = new Set(items.map((i) => i.categoryId));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const unbudgeted: UnbudgetedRow[] = Object.entries(spendingByCategory)
    .filter(([categoryId, spent]) => !budgetedIds.has(categoryId) && spent > 0)
    .map(([categoryId, spent]) => {
      const category = categoryById.get(categoryId);
      return {
        categoryId,
        categoryName: category?.name ?? "Uncategorized",
        categoryColor: category?.color ?? "#6366f1",
        spent,
      };
    })
    .sort((a, b) => b.spent - a.spent);

  return { year, month, currency, rows, totals: budgetTotals(rows), unbudgeted };
}
