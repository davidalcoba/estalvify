// Pure month-commitments math: savings-first budgeting. The order of the
// calculation is the feature — the savings goal is subtracted BEFORE the
// variable budget exists, like one more standing charge, instead of being
// whatever is left at month end (which, when spending expands to the income
// ceiling, is nothing):
//
//   fixed income (Plan, CREDIT)
//     − committed charges (Plan, DEBIT)
//     − savings goal        ← a commitment, not a residue
//     − sinking-fund contributions
//     = variable budget for the month
//
// No Prisma/network — unit-tested in isolation.

import { planTotals, type PlanItemInput, type YearMonth } from "./plan-item";

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Resolve the savings goal to euros. A fixed amount wins; otherwise a percent
 * applies to the month's fixed income; neither set means no goal (0).
 */
export function resolveSavingsGoal(
  fixedIncome: number,
  goalAmount: number | null,
  goalPercent: number | null
): number {
  if (goalAmount != null && goalAmount > 0) return round(goalAmount);
  if (goalPercent != null && goalPercent > 0) {
    return round((fixedIncome * goalPercent) / 100);
  }
  return 0;
}

export interface MonthCommitments {
  fixedIncome: number;
  committedExpenses: number;
  savingsGoal: number;
  sinkingContribution: number;
  variableBudget: number;
}

export function computeCommitments(input: {
  planItems: PlanItemInput[];
  ref: YearMonth;
  savingsGoalAmount: number | null;
  savingsGoalPercent: number | null;
  sinkingContribution?: number;
}): MonthCommitments {
  const totals = planTotals(input.planItems, input.ref);
  const savingsGoal = resolveSavingsGoal(
    totals.monthlyIncome,
    input.savingsGoalAmount,
    input.savingsGoalPercent
  );
  const sinkingContribution = round(input.sinkingContribution ?? 0);
  return {
    fixedIncome: totals.monthlyIncome,
    committedExpenses: totals.monthlyExpenses,
    savingsGoal,
    sinkingContribution,
    variableBudget: round(
      totals.monthlyIncome -
        totals.monthlyExpenses -
        savingsGoal -
        sinkingContribution
    ),
  };
}

export interface VariableSpendSplit {
  total: number;
  fixed: number;
  variable: number;
}

/**
 * Split a month's categorized spending into fixed — covered by a category's
 * planned monthly limit from the Plan, capped at that limit — and variable
 * (everything beyond a limit, and every category without one). The
 * available-to-spend number only moves with the variable part: if rent's
 * 1.389 € knocked it down on the 1st, the single number would be noise
 * instead of signal.
 *
 * Capping by the Plan's own per-category limits is what prevents double
 * counting against the commitments: a charge already subtracted upfront as a
 * committed plan amount (a confirmed series' mirror OR a hand-typed fixed
 * item) never also drains the variable budget — and the same limits drive the
 * category bars and the budget-over alerts, so the three surfaces agree.
 */
export function splitVariableSpend(
  spendByCategory: Record<string, number>,
  plannedByCategory: Record<string, number>
): VariableSpendSplit {
  let total = 0;
  let fixed = 0;
  for (const [categoryId, spent] of Object.entries(spendByCategory)) {
    if (!Number.isFinite(spent)) continue;
    total += spent;
    fixed += Math.min(spent, plannedByCategory[categoryId] ?? 0);
  }
  return {
    total: round(total),
    fixed: round(fixed),
    variable: round(total - fixed),
  };
}

export interface AvailableToSpend {
  /** Variable budget minus variable spend — THE number. */
  available: number;
  /** Where spending should be at this point of the month, linearly. */
  expectedByNow: number;
  /** spent / expectedByNow. 1.0 = on pace, above = spending fast. Null before day 1 or without a budget. */
  paceRatio: number | null;
  daysLeft: number;
  /** Available split across the days left (0 when overdrawn or month over). */
  perDayLeft: number;
}

export function computeAvailable(input: {
  variableBudget: number;
  variableSpent: number;
  dayOfMonth: number;
  daysInMonth: number;
}): AvailableToSpend {
  const available = round(input.variableBudget - input.variableSpent);
  const daysLeft = Math.max(0, input.daysInMonth - input.dayOfMonth);
  const expectedByNow =
    input.daysInMonth > 0
      ? round((input.variableBudget * input.dayOfMonth) / input.daysInMonth)
      : 0;
  const paceRatio =
    expectedByNow > 0
      ? Math.round((input.variableSpent / expectedByNow) * 100) / 100
      : null;
  return {
    available,
    expectedByNow,
    paceRatio,
    daysLeft,
    perDayLeft: daysLeft > 0 && available > 0 ? round(available / daysLeft) : 0,
  };
}
