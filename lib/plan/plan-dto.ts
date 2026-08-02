// Assembles the plain, serializable data the Plan page hands to client
// components: the user's expected income and expense PlanItems, grouped and
// turned into per-category limit rows (reusing budget-progress) plus the monthly
// income/expenses/net totals. Pure (Decimal→number, Date→ISO here) so no
// Decimal/Date crosses the server→client boundary.

import { buildBudgetRow, type BudgetRow } from "@/lib/budget/budget-progress";
import {
  planMonthlyEquivalent,
  plannedMonthlyByCategory,
  planTotals,
  type PlanCadence,
  type PlanDirection,
  type PlanItemInput,
  type PlanTotals,
} from "./plan-item";

export interface CategoryOption {
  id: string;
  name: string;
  color: string;
  parentId: string | null;
}

/** A stored plan item as read from the DB (amount Decimal-ish, onDate Date-ish). */
export interface PlanItemRecord {
  id: string;
  label: string | null;
  direction: PlanDirection;
  categoryId: string | null;
  amount: { toString(): string };
  currency: string;
  cadence: PlanCadence;
  dayOfMonth: number | null;
  onDate: Date | string | null;
}

/** Serializable per-item view model for the client. */
export interface PlanEntryVM {
  id: string;
  label: string | null;
  direction: PlanDirection;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  amount: number;
  currency: string;
  cadence: PlanCadence;
  dayOfMonth: number | null;
  onDate: string | null;
  /** Monthly equivalent (0 for ONE_OFF). */
  monthly: number;
}

/** A category's expense items plus its planned-vs-actual limit row. */
export interface PlanCategoryGroupVM {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  row: BudgetRow;
  items: PlanEntryVM[];
}

export interface PlanData {
  currency: string;
  income: PlanEntryVM[];
  expenseGroups: PlanCategoryGroupVM[];
  totals: PlanTotals;
}

/** Normalize a Date or ISO string to a "YYYY-MM-DD" date, or null. */
function toIsoDate(value: Date | string | null): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

/** Periodic items first, then one-offs by date; used within income and each group. */
function sortEntries(a: PlanEntryVM, b: PlanEntryVM): number {
  const aOneOff = a.cadence === "ONE_OFF";
  const bOneOff = b.cadence === "ONE_OFF";
  if (aOneOff !== bOneOff) return aOneOff ? 1 : -1;
  if (aOneOff && bOneOff) return (a.onDate ?? "").localeCompare(b.onDate ?? "");
  return b.monthly - a.monthly;
}

export function buildPlanData(params: {
  currency: string;
  items: PlanItemRecord[];
  spendingByCategory: Record<string, number>;
  categories: CategoryOption[];
}): PlanData {
  const { currency, items, spendingByCategory, categories } = params;
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const entries: PlanEntryVM[] = items.map((item) => {
    const category = item.categoryId ? categoryById.get(item.categoryId) : undefined;
    const amount = Number(item.amount.toString());
    return {
      id: item.id,
      label: item.label,
      direction: item.direction,
      categoryId: item.categoryId,
      categoryName: category?.name ?? null,
      categoryColor: category?.color ?? null,
      amount,
      currency: item.currency,
      cadence: item.cadence,
      dayOfMonth: item.dayOfMonth,
      onDate: toIsoDate(item.onDate),
      monthly: planMonthlyEquivalent(amount, item.cadence),
    };
  });

  const income = entries.filter((e) => e.direction === "CREDIT").sort(sortEntries);

  // Per-category limit = steady monthly expense total (excludes one-offs).
  const planInputs: PlanItemInput[] = items.map((i) => ({
    direction: i.direction,
    categoryId: i.categoryId,
    amount: Number(i.amount.toString()),
    cadence: i.cadence,
    onDate: toIsoDate(i.onDate),
  }));
  const limitByCategory = plannedMonthlyByCategory(planInputs);

  const expenseByCategory = new Map<string, PlanEntryVM[]>();
  for (const e of entries) {
    if (e.direction !== "DEBIT" || !e.categoryId) continue;
    const list = expenseByCategory.get(e.categoryId) ?? [];
    list.push(e);
    expenseByCategory.set(e.categoryId, list);
  }

  const expenseGroups: PlanCategoryGroupVM[] = Array.from(expenseByCategory.entries())
    .map(([categoryId, groupItems]) => {
      const category = categoryById.get(categoryId);
      const name = category?.name ?? "Uncategorized";
      const color = category?.color ?? "#6366f1";
      const planned = limitByCategory[categoryId] ?? 0;
      const spent = spendingByCategory[categoryId] ?? 0;
      return {
        categoryId,
        categoryName: name,
        categoryColor: color,
        row: buildBudgetRow(
          { categoryId, categoryName: name, categoryColor: color, planned },
          spent
        ),
        items: groupItems.sort(sortEntries),
      };
    })
    .sort((a, b) => b.row.planned - a.row.planned || b.row.spent - a.row.spent);

  return {
    currency,
    income,
    expenseGroups,
    totals: planTotals(planInputs),
  };
}
