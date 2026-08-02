// Assembles the plain, serializable data the Plan page hands to client
// components: the user's expected income and expense PlanItems, grouped and
// turned into per-category limit rows (reusing budget-progress) plus the monthly
// income/expenses/net totals. Pure (Decimal→number, Date→ISO here) so no
// Decimal/Date crosses the server→client boundary.

import { buildBudgetRow, type BudgetRow } from "@/lib/budget/budget-progress";
import {
  isActiveInMonth,
  planMonthlyEquivalent,
  plannedMonthlyByCategory,
  planTotals,
  type PlanCadence,
  type PlanDirection,
  type PlanItemInput,
  type PlanTotals,
  type YearMonth,
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
  endDate: Date | string | null;
  /** Set when the item mirrors a confirmed recurring series. */
  recurringMerchantKey: string | null;
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
  /** Last month this item applies, as an ISO date; null = open-ended. */
  endDate: string | null;
  /** Monthly equivalent (0 for ONE_OFF). */
  monthly: number;
  /** No longer in force in the reference month — kept as a record, counts nowhere. */
  ended: boolean;
  /** Came from confirming a detected recurring series, not typed by hand. */
  fromRecurring: boolean;
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

/** A stored record in the shape the pure planning helpers expect. */
function toPlanInput(item: PlanItemRecord): PlanItemInput {
  return {
    direction: item.direction,
    categoryId: item.categoryId,
    amount: Number(item.amount.toString()),
    cadence: item.cadence,
    onDate: toIsoDate(item.onDate),
    endDate: toIsoDate(item.endDate),
  };
}

/**
 * Ended items last, then periodic before one-offs, one-offs by date; used within
 * income and each group.
 */
function sortEntries(a: PlanEntryVM, b: PlanEntryVM): number {
  if (a.ended !== b.ended) return a.ended ? 1 : -1;
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
  /** The month the plan is read against — items that ended before it don't count. */
  ref: YearMonth;
}): PlanData {
  const { currency, items, spendingByCategory, categories, ref } = params;
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const entries: PlanEntryVM[] = items.map((item) => {
    const category = item.categoryId ? categoryById.get(item.categoryId) : undefined;
    const amount = Number(item.amount.toString());
    const endDate = toIsoDate(item.endDate);
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
      endDate,
      monthly: planMonthlyEquivalent(amount, item.cadence),
      ended: !isActiveInMonth(toPlanInput(item), ref.year, ref.month),
      fromRecurring: item.recurringMerchantKey != null,
    };
  });

  const income = entries.filter((e) => e.direction === "CREDIT").sort(sortEntries);

  // Per-category limit = steady monthly expense total (excludes one-offs and
  // items whose end date has passed).
  const planInputs: PlanItemInput[] = items.map(toPlanInput);
  const limitByCategory = plannedMonthlyByCategory(planInputs, ref);

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
    totals: planTotals(planInputs, ref),
  };
}
