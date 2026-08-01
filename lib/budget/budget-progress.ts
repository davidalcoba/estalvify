// Pure budget-progress logic: turning planned vs. spent amounts into per-row and
// total view models with a status. No React/Prisma — shared by server (page) and
// client (views) and unit-tested in isolation.

export type BudgetStatus = "ok" | "warning" | "over";

/** At or above this % of the planned amount a row is flagged as "warning". */
export const WARNING_THRESHOLD = 80;

export function budgetStatus(planned: number, spent: number): BudgetStatus {
  if (planned <= 0) return spent > 0 ? "over" : "ok";
  const pct = (spent / planned) * 100;
  if (pct > 100) return "over";
  if (pct >= WARNING_THRESHOLD) return "warning";
  return "ok";
}

/** Spent as a percentage of planned, clamped to 0–100 for progress bars. */
export function budgetPercent(planned: number, spent: number): number {
  if (planned <= 0) return spent > 0 ? 100 : 0;
  const pct = Math.round((spent / planned) * 100);
  return Math.max(0, Math.min(100, pct));
}

export interface BudgetRowInput {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  planned: number;
}

export interface BudgetRow extends BudgetRowInput {
  spent: number;
  remaining: number;
  percent: number;
  status: BudgetStatus;
}

export function buildBudgetRow(input: BudgetRowInput, spent: number): BudgetRow {
  return {
    ...input,
    spent,
    remaining: input.planned - spent,
    percent: budgetPercent(input.planned, spent),
    status: budgetStatus(input.planned, spent),
  };
}

export interface BudgetTotals {
  planned: number;
  spent: number;
  remaining: number;
  percent: number;
  status: BudgetStatus;
}

export function budgetTotals(
  rows: { planned: number; spent: number }[]
): BudgetTotals {
  const planned = rows.reduce((sum, r) => sum + r.planned, 0);
  const spent = rows.reduce((sum, r) => sum + r.spent, 0);
  return {
    planned,
    spent,
    remaining: planned - spent,
    percent: budgetPercent(planned, spent),
    status: budgetStatus(planned, spent),
  };
}
